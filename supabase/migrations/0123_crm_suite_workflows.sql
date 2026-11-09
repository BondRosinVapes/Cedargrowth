-- Additive CRM suite fields. Depends on 0120, 0121, and 0122.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0122 have committed:
--   psql --single-transaction -f scripts/crm-apply-0123.sql
-- Do not apply this file with autocommit. An autocommit run is not a deployment procedure.
-- No seed rows. License and facility values are stored references, not certifications.
-- assigned_rep does not grant a login or a role.
-- Prior opportunity stages are rewritten inside one statement before the new check:
--   qualified -> qualification
--   committed -> proposal, still open, original token kept in legacy_stage
--   closed_won -> won, which is still not an invoice or a payment
--   closed_lost -> lost, with an explicit stored note when no loss reason existed
-- A stage outside that set aborts the statement and does not drop the previous check.

do $$
begin
  if to_regclass('public.crm_accounts') is null
     or to_regclass('public.crm_opportunities') is null
     or to_regclass('public.crm_activity') is null
     or to_regclass('public.crm_sales_memberships') is null then
    raise exception 'crm suite tables are incomplete. Apply the bundle, not this file after a partial failure.';
  end if;
end $$;

alter table public.crm_accounts
  add column if not exists license_ref text,
  add column if not exists facility_ref text,
  add column if not exists license_jurisdiction text,
  add column if not exists license_expiry date,
  add column if not exists assigned_rep text;

alter table public.crm_accounts drop constraint if exists crm_accounts_license_ref_len;
alter table public.crm_accounts add constraint crm_accounts_license_ref_len check (license_ref is null or char_length(license_ref) <= 120);
alter table public.crm_accounts drop constraint if exists crm_accounts_facility_ref_len;
alter table public.crm_accounts add constraint crm_accounts_facility_ref_len check (facility_ref is null or char_length(facility_ref) <= 120);
alter table public.crm_accounts drop constraint if exists crm_accounts_license_jurisdiction_len;
alter table public.crm_accounts add constraint crm_accounts_license_jurisdiction_len check (license_jurisdiction is null or char_length(license_jurisdiction) <= 80);
alter table public.crm_accounts drop constraint if exists crm_accounts_assigned_rep_len;
alter table public.crm_accounts add constraint crm_accounts_assigned_rep_len check (assigned_rep is null or char_length(assigned_rep) <= 200);

comment on column public.crm_accounts.license_ref is 'Stored reference only. Not a certification that a license is valid.';
comment on column public.crm_accounts.facility_ref is 'Stored facility reference. Not a certified facility record.';
comment on column public.crm_accounts.assigned_rep is 'CRM label for the assigned rep. Does not grant a login or a role.';

alter table public.crm_contacts add column if not exists preference text not null default 'unspecified';
alter table public.crm_contacts drop constraint if exists crm_contacts_preference_check;
alter table public.crm_contacts add constraint crm_contacts_preference_check check (preference in ('unspecified', 'store_only', 'do_not_contact'));
comment on column public.crm_contacts.preference is 'Store permission is not consent to contact. do_not_contact suppresses outreach from this desk.';

alter table public.crm_opportunities
  add column if not exists loss_reason text,
  add column if not exists next_action text,
  add column if not exists next_action_on date,
  add column if not exists legacy_stage text;
alter table public.crm_opportunities drop constraint if exists crm_opportunities_loss_reason_len;
alter table public.crm_opportunities add constraint crm_opportunities_loss_reason_len check (loss_reason is null or char_length(loss_reason) <= 400);
alter table public.crm_opportunities drop constraint if exists crm_opportunities_next_action_len;
alter table public.crm_opportunities add constraint crm_opportunities_next_action_len check (next_action is null or char_length(next_action) <= 200);
alter table public.crm_opportunities drop constraint if exists crm_opportunities_legacy_stage_len;
alter table public.crm_opportunities add constraint crm_opportunities_legacy_stage_len check (legacy_stage is null or char_length(legacy_stage) <= 40);
comment on column public.crm_opportunities.legacy_stage is 'Original stage token when a 0120 value was rewritten. Null when the stage was already in the current vocabulary.';

-- Mapping and the new stage check are one statement. A failure does not leave the old check dropped.
do $stage$
declare
  unknown_count integer;
begin
  select count(*) into unknown_count
  from public.crm_opportunities
  where stage not in (
    'lead', 'qualified', 'proposal', 'committed', 'closed_won', 'closed_lost',
    'qualification', 'licensed_buyer_review', 'won', 'lost'
  );
  if unknown_count > 0 then
    raise exception 'unsupported opportunity stage; the previous stage check was left in place';
  end if;

  -- The previous check still names the old tokens, so it has to be removed
  -- before those tokens can be rewritten. This drop stays inside the same
  -- statement as the rewrite and the new check.
  alter table public.crm_opportunities drop constraint if exists crm_opportunities_stage_check;

  update public.crm_opportunities
  set
    legacy_stage = stage,
    loss_reason = case
      when stage = 'closed_lost' and (loss_reason is null or char_length(loss_reason) = 0)
        then 'Legacy stage closed_lost. No loss reason was stored.'
      else loss_reason
    end,
    stage = case stage
      when 'qualified' then 'qualification'
      when 'committed' then 'proposal'
      when 'closed_won' then 'won'
      when 'closed_lost' then 'lost'
      else stage
    end
  where stage in ('qualified', 'committed', 'closed_won', 'closed_lost');

  alter table public.crm_opportunities add constraint crm_opportunities_stage_check
    check (stage in ('lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost'));
  alter table public.crm_opportunities drop constraint if exists crm_opportunities_lost_reason;
  alter table public.crm_opportunities add constraint crm_opportunities_lost_reason
    check (stage <> 'lost' or (loss_reason is not null and char_length(loss_reason) > 0));
end
$stage$;

alter table public.crm_tasks add column if not exists owner_actor text;
alter table public.crm_tasks drop constraint if exists crm_tasks_owner_actor_len;
alter table public.crm_tasks add constraint crm_tasks_owner_actor_len check (owner_actor is null or char_length(owner_actor) <= 200);

alter table public.crm_activity drop constraint if exists crm_activity_kind_check;
alter table public.crm_activity add constraint crm_activity_kind_check check (kind in (
  'account_created', 'account_updated',
  'contact_created', 'contact_updated',
  'opportunity_created', 'opportunity_updated',
  'task_created', 'task_updated',
  'note_recorded'
));

create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  body text not null check (char_length(body) between 1 and 2000),
  actor text not null check (char_length(actor) between 3 and 200),
  created_at timestamptz not null default now(),
  public_id text generated always as ('crm:' || brand || ':note:' || id::text) stored unique
);

comment on table public.crm_notes is 'Append-only actual notes. Not seeded and not inferred from a source sync.';

create index if not exists crm_notes_brand_account_idx on public.crm_notes (brand, account_id, created_at desc);

create or replace function crm_private.guard_note()
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
  if tg_op = 'UPDATE' then
    raise exception 'crm notes are append only';
  end if;
  return new;
end;
$$;

create or replace function crm_private.audit_note()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.crm_activity (brand, account_id, kind, summary, actor)
  values (new.brand, new.account_id, 'note_recorded', 'Note appended', new.actor);
  return null;
end;
$$;

drop trigger if exists crm_notes_guard on public.crm_notes;
create trigger crm_notes_guard before insert or update on public.crm_notes
  for each row execute function crm_private.guard_note();
drop trigger if exists crm_notes_audit on public.crm_notes;
create trigger crm_notes_audit after insert on public.crm_notes
  for each row execute function crm_private.audit_note();
drop trigger if exists crm_notes_no_delete on public.crm_notes;
create trigger crm_notes_no_delete before delete on public.crm_notes
  for each row execute function crm_private.reject_delete();

alter table public.crm_notes enable row level security;
alter table public.crm_notes force row level security;
revoke all on table public.crm_notes from public, anon, authenticated;
grant select, insert on table public.crm_notes to service_role;
revoke update, delete on table public.crm_notes from service_role, anon, authenticated, public;

-- New functions are created after 0120 and 0121 revoked execute. Repeat that boundary.
revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
