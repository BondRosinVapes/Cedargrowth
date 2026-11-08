-- Kelvin intake receipts. Draft only: do not apply this from the pull request.
-- Apply it in a reviewed step. The migration fails closed if a table of this
-- name already exists without the task_id primary key contract. A second run
-- against a matching table is a no-op. Setting
-- CEDARGROWTH_KELVIN_INTAKE_RECEIPTS=verified is not proof by itself. The
-- intake route also calls kelvin_intake_receipt_contract() and does not send
-- when that function is missing or returns false.
--
-- task_id is the cross-request reservation. A second insert of the same id
-- fails, so only one outbound proposal can be claimed.

do $create_receipts$
begin
  if to_regclass('public.kelvin_intake_receipts') is null then
    create table public.kelvin_intake_receipts (
      task_id text primary key,
      agent text not null,
      state text not null check (state in ('reserved', 'accepted', 'rejected')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table public.kelvin_intake_receipts enable row level security;
  end if;
end
$create_receipts$;

create or replace function public.kelvin_intake_receipt_contract()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $contract$
  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'kelvin_intake_receipts'
      and c.relkind = 'r'
      and c.relrowsecurity
      and (
        select count(*)
        from pg_index i
        join pg_attribute a
          on a.attrelid = i.indrelid
         and a.attnum = any (i.indkey)
        where i.indrelid = c.oid
          and i.indisprimary
          and i.indnkeyatts = 1
          and a.attname = 'task_id'
          and not a.attisdropped
      ) = 1
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'agent'
          and a.attnotnull
          and a.atttypid = 'text'::regtype
          and not a.attisdropped
      )
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'state'
          and a.attnotnull
          and a.atttypid = 'text'::regtype
          and not a.attisdropped
      )
      and exists (
        select 1
        from pg_constraint k
        where k.conrelid = c.oid
          and k.contype = 'c'
          and pg_get_constraintdef(k.oid) like '%reserved%'
          and pg_get_constraintdef(k.oid) like '%accepted%'
          and pg_get_constraintdef(k.oid) like '%rejected%'
      )
  );
$contract$;

revoke all on function public.kelvin_intake_receipt_contract() from public;

do $role_grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.kelvin_intake_receipt_contract() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.kelvin_intake_receipt_contract() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.kelvin_intake_receipt_contract() to service_role';
  end if;
end
$role_grants$;

do $assert_contract$
begin
  if not public.kelvin_intake_receipt_contract() then
    raise exception 'kelvin_intake_receipts does not satisfy the task_id primary key contract';
  end if;
end
$assert_contract$;

revoke all on table public.kelvin_intake_receipts from public;

do $table_grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.kelvin_intake_receipts from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.kelvin_intake_receipts from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update on table public.kelvin_intake_receipts to service_role';
  end if;
end
$table_grants$;
