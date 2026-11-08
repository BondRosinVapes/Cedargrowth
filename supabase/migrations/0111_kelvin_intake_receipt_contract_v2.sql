-- Additive correction for kelvin intake receipts. Draft only: do not apply
-- this from the pull request. 0110 may already have been applied. This file
-- does not edit 0110 and does not drop existing policies.
--
-- The whole change is one DO block, so plain psql -f rolls it back if the
-- contract fails. A permissive write policy for anon, authenticated, or
-- public is reported and left in place. Remove that policy by hand, then run
-- this file again. Do not set CEDARGROWTH_KELVIN_INTAKE_RECEIPTS until
-- kelvin_intake_receipt_contract_v2() returns ok.

do $migration$
declare
  reason text;
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

  execute 'revoke all on table public.kelvin_intake_receipts from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.kelvin_intake_receipts from anon';
    execute 'revoke all (task_id, agent, state) on table public.kelvin_intake_receipts from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.kelvin_intake_receipts from authenticated';
    execute 'revoke all (task_id, agent, state) on table public.kelvin_intake_receipts from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update on table public.kelvin_intake_receipts to service_role';
  end if;

  execute $create_v2$
    create or replace function public.kelvin_intake_receipt_contract_v2()
    returns text
    language plpgsql
    volatile
    security invoker
    set search_path = pg_catalog, public
    as $fn$
    declare
      rel oid;
      owner_name text;
      policy_names text;
      forged_blocked boolean := false;
    begin
      select c.oid, pg_get_userbyid(c.relowner)
        into rel, owner_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'kelvin_intake_receipts'
        and c.relkind = 'r';
      if rel is null then
        return 'table missing';
      end if;
      if not (select c.relrowsecurity from pg_class c where c.oid = rel) then
        return 'row security is off';
      end if;
      if owner_name in ('anon', 'authenticated', 'public')
         or (exists (select 1 from pg_roles where rolname = 'anon') and pg_has_role('anon', owner_name, 'member'))
         or (exists (select 1 from pg_roles where rolname = 'authenticated') and pg_has_role('authenticated', owner_name, 'member'))
      then
        return 'table owner is reachable by anon or authenticated';
      end if;
      if (
        select count(*)
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
        where i.indrelid = rel
          and i.indisprimary
          and i.indnkeyatts = 1
          and a.attname = 'task_id'
          and not a.attisdropped
      ) <> 1 then
        return 'task_id is not the sole primary key';
      end if;
      if not exists (
        select 1 from pg_attribute a
        where a.attrelid = rel and a.attname = 'agent' and a.attnotnull
          and a.atttypid = 'text'::regtype and not a.attisdropped
      ) or not exists (
        select 1 from pg_attribute a
        where a.attrelid = rel and a.attname = 'state' and a.attnotnull
          and a.atttypid = 'text'::regtype and not a.attisdropped
      ) then
        return 'agent or state column is missing';
      end if;

      if exists (select 1 from pg_roles where rolname = 'anon') and (
        has_table_privilege('anon', rel, 'INSERT')
        or has_table_privilege('anon', rel, 'UPDATE')
        or has_column_privilege('anon', rel, 'task_id', 'INSERT')
        or has_column_privilege('anon', rel, 'agent', 'INSERT')
        or has_column_privilege('anon', rel, 'state', 'INSERT')
        or has_column_privilege('anon', rel, 'state', 'UPDATE')
      ) then
        return 'anon has an effective write privilege';
      end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated') and (
        has_table_privilege('authenticated', rel, 'INSERT')
        or has_table_privilege('authenticated', rel, 'UPDATE')
        or has_column_privilege('authenticated', rel, 'task_id', 'INSERT')
        or has_column_privilege('authenticated', rel, 'agent', 'INSERT')
        or has_column_privilege('authenticated', rel, 'state', 'INSERT')
        or has_column_privilege('authenticated', rel, 'state', 'UPDATE')
      ) then
        return 'authenticated has an effective write privilege';
      end if;
      if has_table_privilege('public', rel, 'INSERT') or has_table_privilege('public', rel, 'UPDATE') then
        return 'public has an effective write privilege';
      end if;

      select string_agg(p.polname, ', ' order by p.polname)
        into policy_names
      from pg_policy p
      where p.polrelid = rel
        and p.polpermissive
        and p.polcmd in ('a', 'w', '*')
        and (
          cardinality(p.polroles) = 0
          or exists (
            select 1
            from unnest(p.polroles) as granted(role_oid)
            where (exists (select 1 from pg_roles where rolname = 'anon') and pg_has_role('anon', granted.role_oid, 'member'))
               or (exists (select 1 from pg_roles where rolname = 'authenticated') and pg_has_role('authenticated', granted.role_oid, 'member'))
          )
        );
      if policy_names is not null then
        return 'permissive write policy applies to anon, authenticated, or public: ' || policy_names;
      end if;

      begin
        insert into public.kelvin_intake_receipts (task_id, agent, state)
        values ('kelvin-contract-probe', 'CONTRACT', 'forged');
        delete from public.kelvin_intake_receipts
        where task_id = 'kelvin-contract-probe' and state = 'forged';
        forged_blocked := false;
      exception
        when check_violation then
          forged_blocked := true;
      end;
      if not forged_blocked then
        return 'state check accepts forged';
      end if;
      return 'ok';
    end
    $fn$
  $create_v2$;

  execute 'revoke all on function public.kelvin_intake_receipt_contract_v2() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.kelvin_intake_receipt_contract_v2() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.kelvin_intake_receipt_contract_v2() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.kelvin_intake_receipt_contract_v2() to service_role';
  end if;

  reason := public.kelvin_intake_receipt_contract_v2();
  if reason is distinct from 'ok' then
    raise exception 'kelvin intake receipt contract failed: %', reason;
  end if;
end
$migration$;
