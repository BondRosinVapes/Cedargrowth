-- Field visits, samples, and media pointers. Depends on 0120 through 0126.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0126 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0127.sql
-- Do not apply this file with autocommit.
-- No seed rows. File bytes live in the private Storage bucket crm-field, not in these tables.
-- This file does not create that bucket.

do $$
begin
  if to_regclass('public.crm_accounts') is null or to_regclass('public.crm_tasks') is null or to_regclass('public.crm_activity') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

create table if not exists public.crm_visits (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  rep_actor text not null check (char_length(rep_actor) between 3 and 200),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  latitude numeric(7,3),
  longitude numeric(7,3),
  outcome text not null check (outcome in ('met_buyer', 'left_info', 'no_answer', 'order_taken', 'other')),
  notes text not null default '' check (char_length(notes) <= 2000),
  public_id text generated always as ('crm:' || brand || ':visit:' || id::text) stored unique,
  check (checked_out_at is null or checked_out_at >= checked_in_at),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

comment on table public.crm_visits is 'Rep check-ins. Location is optional and rounded. Not seeded.';

create table if not exists public.crm_samples (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  visit_id uuid references public.crm_visits (id),
  product_line text not null check (product_line in ('vape', 'preroll', 'gummy', 'other')),
  quantity_units integer not null check (quantity_units > 0),
  left_on date not null,
  follow_up_on date not null,
  notes text not null default '' check (char_length(notes) <= 2000),
  public_id text generated always as ('crm:' || brand || ':sample:' || id::text) stored unique
);

comment on table public.crm_samples is 'Samples left with a retailer. Saving a row also creates a follow-up task. Not seeded.';

create table if not exists public.crm_media (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  visit_id uuid references public.crm_visits (id),
  kind text not null check (kind in ('shelf_photo', 'voice_note')),
  storage_path text not null unique check (char_length(storage_path) between 3 and 300),
  content_type text not null check (char_length(content_type) between 3 and 80),
  byte_size integer not null check (byte_size > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 120),
  created_by text not null check (char_length(created_by) between 3 and 200),
  created_at timestamptz not null default now(),
  public_id text generated always as ('crm:' || brand || ':media:' || id::text) stored unique,
  check ((kind = 'voice_note' and duration_seconds is not null) or (kind = 'shelf_photo' and duration_seconds is null))
);

comment on table public.crm_media is 'Pointers to private Storage objects. Not seeded and not transcribed.';

create index if not exists crm_visits_brand_account_idx on public.crm_visits (brand, account_id, checked_in_at desc);
create index if not exists crm_samples_brand_account_idx on public.crm_samples (brand, account_id, follow_up_on);
create index if not exists crm_media_brand_account_idx on public.crm_media (brand, account_id, created_at desc);

alter table public.crm_activity drop constraint if exists crm_activity_kind_check;
alter table public.crm_activity add constraint crm_activity_kind_check check (kind in (
  'account_created', 'account_updated',
  'contact_created', 'contact_updated',
  'opportunity_created', 'opportunity_updated',
  'task_created', 'task_updated',
  'note_recorded',
  'distributor_order_imported',
  'visit_logged', 'sample_left', 'media_added'
));

create or replace function crm_private.audit_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor)
    values (new.brand, new.account_id, 'visit_logged', 'Visit logged', new.rep_actor);
  end if;
  return null;
end;
$$;

create or replace function crm_private.audit_sample()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_activity (brand, account_id, kind, summary, actor)
  values (new.brand, new.account_id, 'sample_left', 'Samples left', 'field rep');
  return null;
end;
$$;

create or replace function crm_private.audit_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_activity (brand, account_id, kind, summary, actor)
  values (new.brand, new.account_id, 'media_added', case when new.kind = 'voice_note' then 'Voice note added' else 'Shelf photo added' end, new.created_by);
  return null;
end;
$$;

drop trigger if exists crm_visits_audit on public.crm_visits;
create trigger crm_visits_audit after insert on public.crm_visits
  for each row execute function crm_private.audit_visit();
drop trigger if exists crm_samples_audit on public.crm_samples;
create trigger crm_samples_audit after insert on public.crm_samples
  for each row execute function crm_private.audit_sample();
drop trigger if exists crm_media_audit on public.crm_media;
create trigger crm_media_audit after insert on public.crm_media
  for each row execute function crm_private.audit_media();

alter table public.crm_visits enable row level security;
alter table public.crm_visits force row level security;
revoke all on table public.crm_visits from public, anon, authenticated;
grant select, insert, update on table public.crm_visits to service_role;
revoke delete on table public.crm_visits from service_role, anon, authenticated, public;

alter table public.crm_samples enable row level security;
alter table public.crm_samples force row level security;
revoke all on table public.crm_samples from public, anon, authenticated;
grant select, insert on table public.crm_samples to service_role;
revoke update, delete on table public.crm_samples from service_role, anon, authenticated, public;

alter table public.crm_media enable row level security;
alter table public.crm_media force row level security;
revoke all on table public.crm_media from public, anon, authenticated;
grant select, insert on table public.crm_media to service_role;
revoke update, delete on table public.crm_media from service_role, anon, authenticated, public;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
