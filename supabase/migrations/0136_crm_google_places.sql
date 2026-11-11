-- Google place cache and distribution merge audit. Depends on 0120 through 0135.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0135 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0136.sql
-- Do not apply this file with autocommit. This repository does not run it.
-- No seed rows. No grants beyond service_role. Nothing in this file is deleted.

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

comment on table public.crm_google_places is 'Cached Google Places fields for a CedarGrowth account. Not seeded. Page views read this table.';

alter table public.crm_google_places enable row level security;
alter table public.crm_google_places force row level security;
revoke all on table public.crm_google_places from public, anon, authenticated;
grant select, insert, update on table public.crm_google_places to service_role;
revoke delete on table public.crm_google_places from service_role, anon, authenticated, public;

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
  check ((undone_at is null and undone_by is null) or (undone_at is not null and undone_by is not null))
);

comment on table public.crm_distribution_merges is 'Audit of contacts attached to an account after a won deal. prior_accounts stores each contact id and the account id it had before the merge. Rows are undone, never deleted.';

create or replace function crm_private.guard_contact()
returns trigger
language plpgsql
set search_path = public
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
    new.updated_at := now();
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
grant select, insert, update on table public.crm_distribution_merges to service_role;
revoke delete on table public.crm_distribution_merges from service_role, anon, authenticated, public;
