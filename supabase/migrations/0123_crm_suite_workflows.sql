-- Additive CRM suite fields. Depends on 0120, 0121, and 0122.
-- Do not apply this file by itself after a failed earlier file. Use
-- scripts/crm-apply-bundle.sql so 0120 through 0123 commit or roll back together.
-- No seed rows. License and facility values are stored references, not certifications.
-- assigned_rep does not grant a login or a role.

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

alter table public.crm_opportunities drop constraint if exists crm_opportunities_stage_check;
alter table public.crm_opportunities add constraint crm_opportunities_stage_check
  check (stage in ('lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost'));

alter table public.crm_opportunities
  add column if not exists loss_reason text,
  add column if not exists next_action text,
  add column if not exists next_action_on date;
alter table public.crm_opportunities drop constraint if exists crm_opportunities_loss_reason_len;
alter table public.crm_opportunities add constraint crm_opportunities_loss_reason_len check (loss_reason is null or char_length(loss_reason) <= 400);
alter table public.crm_opportunities drop constraint if exists crm_opportunities_next_action_len;
alter table public.crm_opportunities add constraint crm_opportunities_next_action_len check (next_action is null or char_length(next_action) <= 200);
alter table public.crm_opportunities drop constraint if exists crm_opportunities_lost_reason;
alter table public.crm_opportunities add constraint crm_opportunities_lost_reason check (stage <> 'lost' or (loss_reason is not null and char_length(loss_reason) > 0));

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
set search_path = public
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
