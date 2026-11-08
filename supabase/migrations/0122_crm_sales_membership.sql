-- Explicit CRM desk membership. Prepared only. Do not apply from CI.
-- Does not create auth users, send mail, or insert any person.
-- salesperson and administrator are brand scoped. The KELVIN owner path is
-- not a row in this table and is not granted here.
-- Practice roles and user_metadata are not consulted.

create table public.crm_sales_memberships (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  brand text not null check (brand in ('cedargrowth', 'bond')),
  desk_role text not null check (desk_role in ('salesperson', 'administrator')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (auth_user_id, brand)
);

comment on table public.crm_sales_memberships is
  'Server-controlled sales or CRM administrator membership. Empty until an administrator inserts a row for an existing auth user. Not implied by Practice OWNER or KELVIN.';

create index crm_sales_memberships_user_idx
  on public.crm_sales_memberships (auth_user_id)
  where revoked_at is null;

alter table public.crm_sales_memberships enable row level security;
alter table public.crm_sales_memberships force row level security;

revoke all on table public.crm_sales_memberships from public, anon, authenticated;
grant select on table public.crm_sales_memberships to service_role;
revoke insert, update, delete on table public.crm_sales_memberships from service_role, anon, authenticated, public;
