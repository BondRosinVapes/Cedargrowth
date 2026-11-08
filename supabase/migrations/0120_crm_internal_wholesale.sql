-- CedarGrowth internal wholesale CRM. Prepared only. Do not apply from CI.
-- This file creates empty CRM tables. It does not seed accounts, contacts,
-- orders, or activity, and it does not alter Practice, KELVIN, reservations,
-- auth, roles, or existing grants.
--
-- Number 0120 leaves 0110 free for the separate KELVIN intake migration.
-- Brand is immutable. Activity is append only. Forecast cents are not revenue.

create schema if not exists crm_private;
revoke all on schema crm_private from public, anon, authenticated;
grant usage on schema crm_private to service_role;

create or replace function crm_private.reject_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'crm rows are not deleted in this version';
end;
$$;

create or replace function crm_private.reject_brand_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.brand is distinct from old.brand then
    raise exception 'brand is immutable';
  end if;
  return new;
end;
$$;

create table public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  display_name text not null check (char_length(display_name) between 1 and 160),
  status text not null check (status in ('prospect', 'active', 'paused', 'closed')),
  city text check (city is null or char_length(city) <= 80),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null check (char_length(created_by) between 3 and 200),
  updated_by text not null check (char_length(updated_by) between 3 and 200),
  public_id text generated always as ('crm:' || brand || ':account:' || id::text) stored unique
);

comment on column public.crm_accounts.notes is 'CRM-owned sales notes. Not a verified license and not a Canix record.';
comment on column public.crm_accounts.city is 'Operator entered location. Not a verified address.';

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  name text not null check (char_length(name) between 1 and 160),
  title text check (title is null or char_length(title) <= 120),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null check (char_length(created_by) between 3 and 200),
  updated_by text not null check (char_length(updated_by) between 3 and 200),
  public_id text generated always as ('crm:' || brand || ':contact:' || id::text) stored unique
);

comment on table public.crm_contacts is 'Business contacts. Email is not unique. Rows are never merged by email or domain.';

create table public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  name text not null check (char_length(name) between 1 and 160),
  stage text not null check (stage in ('lead', 'qualified', 'proposal', 'committed', 'closed_won', 'closed_lost')),
  forecast_cents integer check (forecast_cents is null or (forecast_cents >= 0 and forecast_cents <= 100000000000)),
  currency text not null default 'USD' check (currency = 'USD'),
  expected_close_on date,
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null check (char_length(created_by) between 3 and 200),
  updated_by text not null check (char_length(updated_by) between 3 and 200),
  public_id text generated always as ('crm:' || brand || ':opportunity:' || id::text) stored unique
);

comment on column public.crm_opportunities.forecast_cents is 'Operator forecast in USD cents. Not invoiced revenue and not paid revenue.';
comment on column public.crm_opportunities.expected_close_on is 'Expected close. Not an invoice date and not a reorder prediction.';

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid references public.crm_accounts (id),
  opportunity_id uuid references public.crm_opportunities (id),
  title text not null check (char_length(title) between 1 and 160),
  due_on date,
  status text not null check (status in ('open', 'done')),
  notes text not null default '' check (char_length(notes) <= 4000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null check (char_length(created_by) between 3 and 200),
  updated_by text not null check (char_length(updated_by) between 3 and 200),
  public_id text generated always as ('crm:' || brand || ':task:' || id::text) stored unique
);

create table public.crm_activity (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid references public.crm_accounts (id),
  opportunity_id uuid references public.crm_opportunities (id),
  task_id uuid references public.crm_tasks (id),
  kind text not null check (kind in (
    'account_created', 'account_updated',
    'contact_created', 'contact_updated',
    'opportunity_created', 'opportunity_updated',
    'task_created', 'task_updated'
  )),
  summary text not null check (char_length(summary) between 1 and 400),
  actor text not null check (char_length(actor) between 3 and 200),
  created_at timestamptz not null default now(),
  public_id text generated always as ('crm:' || brand || ':activity:' || id::text) stored unique
);

comment on table public.crm_activity is 'Append-only history of CRM writes. Not seeded and not a Canix order feed.';

create index crm_accounts_brand_updated_idx on public.crm_accounts (brand, updated_at desc);
create index crm_accounts_brand_status_idx on public.crm_accounts (brand, status);
create index crm_accounts_brand_name_idx on public.crm_accounts (brand, lower(display_name));
create index crm_contacts_account_idx on public.crm_contacts (account_id);
create index crm_contacts_brand_account_idx on public.crm_contacts (brand, account_id);
create index crm_contacts_brand_name_idx on public.crm_contacts (brand, lower(name));
create index crm_opportunities_account_idx on public.crm_opportunities (account_id);
create index crm_opportunities_brand_stage_idx on public.crm_opportunities (brand, stage);
create index crm_tasks_account_idx on public.crm_tasks (account_id);
create index crm_tasks_opportunity_idx on public.crm_tasks (opportunity_id);
create index crm_tasks_brand_status_idx on public.crm_tasks (brand, status, due_on);
create index crm_activity_brand_created_idx on public.crm_activity (brand, created_at desc);
create index crm_activity_account_idx on public.crm_activity (account_id);

create or replace function crm_private.guard_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.brand is distinct from old.brand then
    raise exception 'brand is immutable';
  end if;
  if tg_op = 'UPDATE' then
    if new.display_name is not distinct from old.display_name
       and new.status is not distinct from old.status
       and new.city is not distinct from old.city
       and new.notes is not distinct from old.notes then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function crm_private.audit_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parts text := '';
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor)
    values (new.brand, new.id, 'account_created', 'Account created', new.created_by);
    return null;
  end if;
  if new.display_name is distinct from old.display_name then parts := parts || 'display_name '; end if;
  if new.status is distinct from old.status then parts := parts || 'status '; end if;
  if new.city is distinct from old.city then parts := parts || 'city '; end if;
  if new.notes is distinct from old.notes then parts := parts || 'notes '; end if;
  if parts <> '' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor)
    values (new.brand, new.id, 'account_updated', 'Updated account fields: ' || trim(parts), new.updated_by);
  end if;
  return null;
end;
$$;

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
  if tg_op = 'UPDATE' and (new.brand is distinct from old.brand or new.account_id is distinct from old.account_id) then
    raise exception 'brand is immutable';
  end if;
  if tg_op = 'UPDATE' then
    if new.name is not distinct from old.name
       and new.title is not distinct from old.title
       and new.email is not distinct from old.email
       and new.phone is not distinct from old.phone
       and new.notes is not distinct from old.notes then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function crm_private.audit_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor)
    values (new.brand, new.account_id, 'contact_created', 'Contact created', new.created_by);
  else
    insert into public.crm_activity (brand, account_id, kind, summary, actor)
    values (new.brand, new.account_id, 'contact_updated', 'Contact updated', new.updated_by);
  end if;
  return null;
end;
$$;

create or replace function crm_private.guard_opportunity()
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
  if tg_op = 'UPDATE' and (new.brand is distinct from old.brand or new.account_id is distinct from old.account_id) then
    raise exception 'brand is immutable';
  end if;
  if tg_op = 'UPDATE' then
    if new.name is not distinct from old.name
       and new.stage is not distinct from old.stage
       and new.forecast_cents is not distinct from old.forecast_cents
       and new.expected_close_on is not distinct from old.expected_close_on
       and new.notes is not distinct from old.notes then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function crm_private.audit_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parts text := '';
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, opportunity_id, kind, summary, actor)
    values (new.brand, new.account_id, new.id, 'opportunity_created', 'Opportunity created', new.created_by);
    return null;
  end if;
  if new.name is distinct from old.name then parts := parts || 'name '; end if;
  if new.stage is distinct from old.stage then parts := parts || 'stage '; end if;
  if new.forecast_cents is distinct from old.forecast_cents then parts := parts || 'forecast '; end if;
  if new.expected_close_on is distinct from old.expected_close_on then parts := parts || 'expected_close '; end if;
  if new.notes is distinct from old.notes then parts := parts || 'notes '; end if;
  if parts <> '' then
    insert into public.crm_activity (brand, account_id, opportunity_id, kind, summary, actor)
    values (new.brand, new.account_id, new.id, 'opportunity_updated', 'Updated opportunity fields: ' || trim(parts), new.updated_by);
  end if;
  return null;
end;
$$;

create or replace function crm_private.guard_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent text;
  opp_brand text;
  opp_account uuid;
begin
  if new.account_id is not null then
    select brand into parent from public.crm_accounts where id = new.account_id;
    if parent is null or parent is distinct from new.brand then
      raise exception 'brand does not match account';
    end if;
  end if;
  if new.opportunity_id is not null then
    select brand, account_id into opp_brand, opp_account
    from public.crm_opportunities where id = new.opportunity_id;
    if opp_brand is null or opp_brand is distinct from new.brand then
      raise exception 'brand does not match opportunity';
    end if;
    if new.account_id is null then
      new.account_id := opp_account;
    elsif opp_account is distinct from new.account_id then
      raise exception 'task account does not match opportunity';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.brand is distinct from old.brand then
    raise exception 'brand is immutable';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status = 'open' then
    new.completed_at := null;
  end if;
  if tg_op = 'UPDATE' then
    if new.title is not distinct from old.title
       and new.due_on is not distinct from old.due_on
       and new.status is not distinct from old.status
       and new.notes is not distinct from old.notes
       and new.account_id is not distinct from old.account_id
       and new.opportunity_id is not distinct from old.opportunity_id then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function crm_private.audit_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, opportunity_id, task_id, kind, summary, actor)
    values (new.brand, new.account_id, new.opportunity_id, new.id, 'task_created', 'Task created', new.created_by);
  else
    insert into public.crm_activity (brand, account_id, opportunity_id, task_id, kind, summary, actor)
    values (new.brand, new.account_id, new.opportunity_id, new.id, 'task_updated', 'Task updated', new.updated_by);
  end if;
  return null;
end;
$$;

create trigger crm_accounts_guard before insert or update on public.crm_accounts
  for each row execute function crm_private.guard_account();
create trigger crm_accounts_audit after insert or update on public.crm_accounts
  for each row execute function crm_private.audit_account();
create trigger crm_accounts_no_delete before delete on public.crm_accounts
  for each row execute function crm_private.reject_delete();

create trigger crm_contacts_guard before insert or update on public.crm_contacts
  for each row execute function crm_private.guard_contact();
create trigger crm_contacts_audit after insert or update on public.crm_contacts
  for each row execute function crm_private.audit_contact();
create trigger crm_contacts_no_delete before delete on public.crm_contacts
  for each row execute function crm_private.reject_delete();

create trigger crm_opportunities_guard before insert or update on public.crm_opportunities
  for each row execute function crm_private.guard_opportunity();
create trigger crm_opportunities_audit after insert or update on public.crm_opportunities
  for each row execute function crm_private.audit_opportunity();
create trigger crm_opportunities_no_delete before delete on public.crm_opportunities
  for each row execute function crm_private.reject_delete();

create trigger crm_tasks_guard before insert or update on public.crm_tasks
  for each row execute function crm_private.guard_task();
create trigger crm_tasks_audit after insert or update on public.crm_tasks
  for each row execute function crm_private.audit_task();
create trigger crm_tasks_no_delete before delete on public.crm_tasks
  for each row execute function crm_private.reject_delete();

create trigger crm_activity_no_update before update on public.crm_activity
  for each row execute function crm_private.reject_delete();
create trigger crm_activity_no_delete before delete on public.crm_activity
  for each row execute function crm_private.reject_delete();

alter table public.crm_accounts enable row level security;
alter table public.crm_accounts force row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_contacts force row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_opportunities force row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_tasks force row level security;
alter table public.crm_activity enable row level security;
alter table public.crm_activity force row level security;

revoke all on table public.crm_accounts from public, anon, authenticated;
revoke all on table public.crm_contacts from public, anon, authenticated;
revoke all on table public.crm_opportunities from public, anon, authenticated;
revoke all on table public.crm_tasks from public, anon, authenticated;
revoke all on table public.crm_activity from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.crm_accounts to service_role;
grant select, insert, update, delete on table public.crm_contacts to service_role;
grant select, insert, update, delete on table public.crm_opportunities to service_role;
grant select, insert, update, delete on table public.crm_tasks to service_role;
grant select on table public.crm_activity to service_role;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
