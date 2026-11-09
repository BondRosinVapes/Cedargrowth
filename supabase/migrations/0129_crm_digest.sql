-- Weekly digest activity kind. Depends on 0120 through 0128.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0128 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0129.sql
-- Do not apply this file with autocommit.
-- No seed rows. This file does not send email and does not schedule a job.

do $$
begin
  if to_regclass('public.crm_activity') is null or to_regclass('public.crm_accounts') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

alter table public.crm_activity drop constraint if exists crm_activity_kind_check;
alter table public.crm_activity add constraint crm_activity_kind_check check (kind in (
  'account_created', 'account_updated',
  'contact_created', 'contact_updated',
  'opportunity_created', 'opportunity_updated',
  'task_created', 'task_updated',
  'note_recorded',
  'distributor_order_imported',
  'visit_logged', 'sample_left', 'media_added',
  'batch_recorded', 'batch_released', 'reorder_link_created', 'reorder_requested',
  'digest_sent'
));

create or replace function public.crm_record_digest(p_brand text, p_actor text, p_summary text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_brand not in ('cedargrowth', 'bond') then
    raise exception 'brand is not recognized';
  end if;
  if p_actor is null or char_length(p_actor) < 3 or char_length(p_actor) > 200 then
    raise exception 'actor is not valid';
  end if;
  if p_summary is null or char_length(p_summary) < 1 or char_length(p_summary) > 400 then
    raise exception 'summary is not valid';
  end if;
  insert into public.crm_activity (brand, kind, summary, actor)
  values (p_brand, 'digest_sent', p_summary, p_actor)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.crm_record_digest(text, text, text) from public, anon, authenticated;
grant execute on function public.crm_record_digest(text, text, text) to service_role;

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
