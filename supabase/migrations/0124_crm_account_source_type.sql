-- Additive CRM account fields for the dashboard. Depends on 0120 through 0123.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0123 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0124.sql
-- Do not apply this file with autocommit.
-- No seed rows. Both columns are nullable, so existing accounts read as not set.
-- account_type is a sales label. It is not a license certification.
-- lead_source records how the account reached this desk. It is not consent to contact.

do $$
begin
  if to_regclass('public.crm_accounts') is null then
    raise exception 'crm_accounts is missing. Apply the bundle, not this file.';
  end if;
end $$;

alter table public.crm_accounts
  add column if not exists account_type text,
  add column if not exists lead_source text;

alter table public.crm_accounts drop constraint if exists crm_accounts_account_type_check;
alter table public.crm_accounts add constraint crm_accounts_account_type_check check (account_type is null or account_type in (
  'adult_use_dispensary', 'microbusiness', 'distributor', 'registered_organization', 'processor', 'cultivator', 'other'
));
alter table public.crm_accounts drop constraint if exists crm_accounts_lead_source_check;
alter table public.crm_accounts add constraint crm_accounts_lead_source_check check (lead_source is null or lead_source in (
  'referral', 'leaflink', 'trade_show', 'cold_outreach', 'website', 'hoodie', 'existing_relationship', 'other'
));

comment on column public.crm_accounts.account_type is 'Sales label for the buyer type. Not a license certification.';
comment on column public.crm_accounts.lead_source is 'How the account reached this desk. Not consent to contact.';
