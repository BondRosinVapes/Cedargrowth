-- Google place cache and distribution merge audit. Depends on 0120 through 0135.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0135 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0136.sql
-- Do not apply this file with autocommit. This repository does not run it.
-- No seed rows. No grants beyond service_role. No rows are deleted.
-- The append-only trigger is dropped and created again so a second apply succeeds.

do $$
begin
  if to_regclass('public.crm_accounts') is null or to_regclass('public.crm_contacts') is null or to_regclass('public.crm_opportunities') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

create table if not exists public.crm_google_places (
  account_id uuid primary key references public.crm_accounts (id),
  brand text not null check (brand = 'cedargrowth'),
  place_id text check (place_id is null or char_length(place_id) between 1 and 200),
  match_status text not null check (match_status in ('matched', 'none')),
  fields jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

comment on table public.crm_google_places is 'Google place_id for a CedarGrowth dispensary. fields holds name, rating, hours, phone, website, Maps link, photo name, and credits only when the account has a Won deal. Not seeded.';
comment on column public.crm_google_places.fields is 'Place details for a dispensary with a Won deal. Every other dispensary keeps this object empty.';

alter table public.crm_google_places enable row level security;
alter table public.crm_google_places force row level security;
revoke all on table public.crm_google_places from public, anon, authenticated;
grant select, insert, update on table public.crm_google_places to service_role;
revoke delete, truncate, references, trigger on table public.crm_google_places from service_role, anon, authenticated, public;

create table if not exists public.crm_distribution_merges (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand = 'cedargrowth'),
  account_id uuid not null references public.crm_accounts (id),
  opportunity_id uuid not null references public.crm_opportunities (id),
  actor text not null check (char_length(actor) between 3 and 200),
  contact_ids uuid[] not null,
  prior_accounts jsonb not null default '[]'::jsonb check (jsonb_typeof(prior_accounts) = 'array'),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by text check (undone_by is null or char_length(undone_by) between 3 and 200),
  reassigned_ids uuid[] not null default '{}',
  check ((undone_at is null and undone_by is null) or (undone_at is not null and undone_by is not null))
);

comment on table public.crm_distribution_merges is 'Append-only audit of contacts attached to an account after a won deal. prior_accounts stores each contact id and the account id it had before the merge. reassigned_ids lists contacts skipped on undo because their account changed later. Rows are undone, never deleted or rewritten.';
comment on column public.crm_distribution_merges.reassigned_ids is 'Contacts skipped on undo because their account changed after the merge.';

create or replace function crm_private.guard_contact()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  parent text;
begin
  select brand into parent from public.crm_accounts where id = new.account_id;
  if parent is null or parent is distinct from new.brand then
    raise exception 'brand does not match account';
  end if;
  if tg_op = 'UPDATE' and new.brand is distinct from old.brand then
    raise exception 'brand is immutable';
  end if;
  if tg_op = 'UPDATE' then
    if new.name is not distinct from old.name
       and new.title is not distinct from old.title
       and new.email is not distinct from old.email
       and new.phone is not distinct from old.phone
       and new.notes is not distinct from old.notes
       and new.account_id is not distinct from old.account_id then
      return old;
    end if;
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

comment on function crm_private.guard_contact() is 'Brand stays fixed. account_id may move to another account of the same brand so a won deal can attach contacts. An unchanged update is ignored.';

create unique index if not exists crm_distribution_merges_open_idx
  on public.crm_distribution_merges (opportunity_id)
  where undone_at is null;

alter table public.crm_distribution_merges enable row level security;
alter table public.crm_distribution_merges force row level security;
revoke all on table public.crm_distribution_merges from public, anon, authenticated;
grant select, insert on table public.crm_distribution_merges to service_role;
revoke update, delete, truncate, references, trigger on table public.crm_distribution_merges from service_role, anon, authenticated, public;

create or replace function public.crm_guard_distribution_merge()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'merge audit is append-only';
  end if;
  if old.undone_at is not null then
    raise exception 'merge audit is append-only';
  end if;
  if new.id is distinct from old.id
     or new.brand is distinct from old.brand
     or new.account_id is distinct from old.account_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.actor is distinct from old.actor
     or new.contact_ids is distinct from old.contact_ids
     or new.prior_accounts is distinct from old.prior_accounts
     or new.created_at is distinct from old.created_at then
    raise exception 'merge audit is append-only';
  end if;
  if new.undone_at is null or new.undone_by is null then
    raise exception 'merge audit is append-only';
  end if;
  return new;
end;
$$;

comment on function public.crm_guard_distribution_merge() is 'The merge audit accepts one undo update. The original row stays. A second update or a delete is rejected.';

revoke all on function public.crm_guard_distribution_merge() from public, anon, authenticated, service_role;

drop trigger if exists crm_distribution_merges_append_only on public.crm_distribution_merges;
create trigger crm_distribution_merges_append_only
  before update or delete on public.crm_distribution_merges
  for each row execute function public.crm_guard_distribution_merge();

create or replace function public.crm_merge_won_distribution(p_opportunity_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_brand text;
  v_account uuid;
  v_type text;
  v_license text;
  v_key text;
  v_open uuid;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_priors jsonb := '[]'::jsonb;
  rec record;
begin
  if p_actor is null or char_length(btrim(p_actor)) < 3 or char_length(btrim(p_actor)) > 200 then
    return jsonb_build_object('ok', false, 'code', 'actor');
  end if;
  select brand, account_id into v_brand, v_account
  from public.crm_opportunities
  where id = p_opportunity_id
  for update;
  if v_brand is null then
    return jsonb_build_object('ok', false, 'code', 'missing');
  end if;
  if v_brand <> 'cedargrowth' then
    return jsonb_build_object('ok', true, 'code', 'skipped');
  end if;
  select id into v_open
  from public.crm_distribution_merges
  where opportunity_id = p_opportunity_id and undone_at is null;
  if v_open is not null then
    return jsonb_build_object('ok', true, 'code', 'already');
  end if;
  select account_type, license_ref into v_type, v_license
  from public.crm_accounts
  where id = v_account and brand = 'cedargrowth';
  if v_type is null or v_type not in ('adult_use_dispensary', 'microbusiness', 'registered_organization') then
    return jsonb_build_object('ok', true, 'code', 'skipped');
  end if;
  v_key := lower(btrim(coalesce(v_license, '')));
  if v_key <> '' then
    for rec in
      select c.id as contact_id, c.account_id as prior_account_id
      from public.crm_contacts c
      join public.crm_accounts a on a.id = c.account_id and a.brand = c.brand
      where c.brand = 'cedargrowth'
        and a.brand = 'cedargrowth'
        and a.account_type in ('adult_use_dispensary', 'microbusiness', 'registered_organization')
        and a.id <> v_account
        and a.license_ref is not null
        and btrim(a.license_ref) <> ''
        and lower(btrim(a.license_ref)) = v_key
      order by c.id
    loop
      update public.crm_contacts
      set account_id = v_account, updated_by = btrim(p_actor)
      where id = rec.contact_id and brand = 'cedargrowth';
      v_ids := v_ids || rec.contact_id;
      v_priors := v_priors || jsonb_build_array(jsonb_build_object('contactId', rec.contact_id, 'priorAccountId', rec.prior_account_id));
    end loop;
  end if;
  insert into public.crm_distribution_merges (brand, account_id, opportunity_id, actor, contact_ids, prior_accounts)
  values ('cedargrowth', v_account, p_opportunity_id, btrim(p_actor), v_ids, v_priors)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'code', 'merged', 'id', v_id, 'moved', coalesce(cardinality(v_ids), 0));
end;
$$;

comment on function public.crm_merge_won_distribution(uuid, text) is 'One transaction. Moves contacts from other CedarGrowth dispensary accounts with the same trimmed lowercase license onto the won dispensary account and writes one audit row. A distributor or other account type is not a source. A blank license matches nothing. Zero contacts still writes the audit row.';

create or replace function public.crm_undo_distribution_merge(p_merge_id uuid, p_actor text, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row public.crm_distribution_merges%rowtype;
  v_item jsonb;
  v_contact uuid;
  v_prior uuid;
  v_current uuid;
  v_brand text;
  v_refused jsonb := '[]'::jsonb;
  v_reassigned uuid[] := '{}';
begin
  if p_actor is null or char_length(btrim(p_actor)) < 3 or char_length(btrim(p_actor)) > 200 then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_row
  from public.crm_distribution_merges
  where id = p_merge_id and brand = 'cedargrowth' and undone_at is null
  for update;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(v_row.prior_accounts, '[]'::jsonb))
  loop
    v_contact := nullif(v_item->>'contactId', '')::uuid;
    v_prior := nullif(v_item->>'priorAccountId', '')::uuid;
    select account_id into v_current from public.crm_contacts where id = v_contact and brand = 'cedargrowth';
    if v_current is not null and v_current is distinct from v_row.account_id then
      v_reassigned := v_reassigned || v_contact;
    else
      select brand into v_brand from public.crm_accounts where id = v_prior;
      if v_brand is distinct from 'cedargrowth' then
        v_refused := v_refused || jsonb_build_array(v_item->>'contactId');
      else
        update public.crm_contacts
        set account_id = v_prior, updated_by = btrim(p_actor)
        where id = v_contact and brand = 'cedargrowth';
      end if;
    end if;
  end loop;
  update public.crm_distribution_merges
  set undone_at = p_now, undone_by = btrim(p_actor), reassigned_ids = v_reassigned
  where id = p_merge_id and undone_at is null;
  return jsonb_build_object(
    'ok', true,
    'refused', v_refused,
    'reassigned', to_jsonb(v_reassigned),
    'merge', jsonb_build_object(
      'id', v_row.id,
      'account_id', v_row.account_id,
      'opportunity_id', v_row.opportunity_id,
      'actor', v_row.actor,
      'contact_ids', to_jsonb(v_row.contact_ids),
      'prior_accounts', v_row.prior_accounts,
      'created_at', v_row.created_at,
      'undone_at', p_now,
      'undone_by', btrim(p_actor),
      'reassigned_ids', to_jsonb(v_reassigned)
    )
  );
end;
$$;

comment on function public.crm_undo_distribution_merge(uuid, text, timestamptz) is 'One transaction. Restores each contact that is still on the won account. A contact whose account changed after the merge is skipped, listed in reassigned_ids, and left where it is. A missing or non CedarGrowth prior account is refused and reported. Any desk staff may call this. The audit row is marked undone once.';

revoke all on function public.crm_merge_won_distribution(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_merge_won_distribution(uuid, text) to service_role;
revoke all on function public.crm_undo_distribution_merge(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_undo_distribution_merge(uuid, text, timestamptz) to service_role;
