-- Email delivery log. Depends on 0120 through 0129.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0129 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0130.sql
-- Do not apply this file with autocommit.
-- No seed rows. The hosted 0129 did not create this table.
-- This file does not send email, add a tracking pixel, or schedule a job.
-- Open tracking is a Resend domain setting, not something this file turns on.

do $$
begin
  if to_regclass('public.crm_accounts') is null or to_regclass('public.crm_activity') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

create table if not exists public.crm_email_log (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  kind text not null check (kind in ('digest', 'reorder_link')),
  resend_id text not null unique check (char_length(resend_id) between 1 and 120),
  recipient text not null check (char_length(recipient) between 3 and 200),
  account_id uuid null references public.crm_accounts (id),
  sent_at timestamptz not null default now(),
  last_event text null check (last_event is null or last_event in ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked')),
  last_event_at timestamptz null,
  created_by text not null check (char_length(created_by) between 3 and 200)
);

comment on table public.crm_email_log is 'Resend message ids and delivery status. No message body. Not seeded.';

create index if not exists crm_email_log_brand_sent_idx on public.crm_email_log (brand, sent_at desc);
create index if not exists crm_email_log_brand_account_idx on public.crm_email_log (brand, account_id);

alter table public.crm_email_log enable row level security;
alter table public.crm_email_log force row level security;
revoke all on table public.crm_email_log from public, anon, authenticated;
grant select, insert, update on table public.crm_email_log to service_role;
revoke delete on table public.crm_email_log from service_role, anon, authenticated, public;
