-- Manual rollback for the wholesale CRM. Not a migration.
-- Do not place this file in supabase/migrations.
-- Drops only objects created by 0123, 0122, 0121, and 0120.
-- Does not touch Practice, KELVIN, reservations, auth, or roles.
-- Run only after Gary approves, and only if those migrations were applied.

drop table if exists public.crm_sales_memberships;
drop table if exists public.crm_intel_alert_events;
drop table if exists public.crm_intel_alerts;
drop table if exists public.crm_intel_recommendations;

drop table if exists public.crm_notes;
drop table if exists public.crm_activity;
drop table if exists public.crm_tasks;
drop table if exists public.crm_opportunities;
drop table if exists public.crm_contacts;
drop table if exists public.crm_accounts;

drop schema if exists crm_private cascade;
