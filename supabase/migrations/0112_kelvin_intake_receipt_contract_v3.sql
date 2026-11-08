-- Additive contract v3. Draft only: do not apply this from the pull request.
-- 0110 and 0111 are unchanged. On a database with no receipt table, this file
-- is the whole apply path. It does not bulk-apply those earlier files. If the
-- table is already present, permissive policies are left in place and the
-- contract fails closed until an operator removes them.
--
-- The change is one DO block. Plain psql -f rolls that block back when the
-- contract does not return ok.
--
-- Delete grants and permissive delete policies fail the contract. The forged
-- probe insert always rolls back, including when a before insert trigger
-- rewrites the row or writes somewhere else.
--
-- anon or authenticated having bypassrls, or being able to set role to a
-- bypassrls or superuser role, fails the contract. PostgREST does not accept
-- SET ROLE from an HTTP client. It sets one request role from the JWT role
-- claim. This membership check is the catalog fact that a session already
-- running as anon or authenticated could assume that role. It is not a claim
-- that the public anon client can send SET ROLE.
--
-- Do not set CEDARGROWTH_KELVIN_INTAKE_RECEIPTS until
-- kelvin_intake_receipt_contract_v3() returns ok.

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
  else
    delete from public.kelvin_intake_receipts where task_id = 'kelvin-contract-probe';
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
    execute 'revoke delete, truncate on table public.kelvin_intake_receipts from service_role';
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update on table public.kelvin_intake_receipts to service_role';
  end if;

  execute $create_v3$
    create or replace function public.kelvin_intake_receipt_contract_v3()
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
      dangerous_names text;
      forged_blocked boolean := false;
      probe_error text;
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

      if exists (select 1 from pg_roles where rolname = 'anon' and rolsuper) then
        return 'anon is superuser';
      end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated' and rolsuper) then
        return 'authenticated is superuser';
      end if;
      if exists (select 1 from pg_roles where rolname = 'anon' and rolbypassrls) then
        return 'anon has bypassrls';
      end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated' and rolbypassrls) then
        return 'authenticated has bypassrls';
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
      if exists (select 1 from pg_roles where rolname = 'anon') and (
        has_table_privilege('anon', rel, 'DELETE')
        or has_table_privilege('anon', rel, 'TRUNCATE')
      ) then
        return 'anon has an effective delete privilege';
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
      if exists (select 1 from pg_roles where rolname = 'authenticated') and (
        has_table_privilege('authenticated', rel, 'DELETE')
        or has_table_privilege('authenticated', rel, 'TRUNCATE')
      ) then
        return 'authenticated has an effective delete privilege';
      end if;
      if has_table_privilege('public', rel, 'INSERT') or has_table_privilege('public', rel, 'UPDATE') then
        return 'public has an effective write privilege';
      end if;
      if has_table_privilege('public', rel, 'DELETE') or has_table_privilege('public', rel, 'TRUNCATE') then
        return 'public has an effective delete privilege';
      end if;

      select string_agg(p.polname, ', ' order by p.polname)
        into policy_names
      from pg_policy p
      where p.polrelid = rel
        and p.polpermissive
        and p.polcmd in ('a', 'w', 'd', '*')
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
        return 'permissive insert, update, or delete policy applies to anon, authenticated, or public: ' || policy_names;
      end if;

      if exists (select 1 from pg_roles where rolname = 'anon') then
        select string_agg(r.rolname, ', ' order by r.rolname)
          into dangerous_names
        from pg_roles r
        where r.rolname <> 'anon'
          and pg_has_role('anon', r.oid, 'set')
          and r.rolsuper;
        if dangerous_names is not null then
          return 'anon can set role to superuser role: ' || dangerous_names;
        end if;
        select string_agg(r.rolname, ', ' order by r.rolname)
          into dangerous_names
        from pg_roles r
        where r.rolname <> 'anon'
          and pg_has_role('anon', r.oid, 'set')
          and r.rolbypassrls;
        if dangerous_names is not null then
          return 'anon can set role to bypassrls role: ' || dangerous_names;
        end if;
      end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated') then
        select string_agg(r.rolname, ', ' order by r.rolname)
          into dangerous_names
        from pg_roles r
        where r.rolname <> 'authenticated'
          and pg_has_role('authenticated', r.oid, 'set')
          and r.rolsuper;
        if dangerous_names is not null then
          return 'authenticated can set role to superuser role: ' || dangerous_names;
        end if;
        select string_agg(r.rolname, ', ' order by r.rolname)
          into dangerous_names
        from pg_roles r
        where r.rolname <> 'authenticated'
          and pg_has_role('authenticated', r.oid, 'set')
          and r.rolbypassrls;
        if dangerous_names is not null then
          return 'authenticated can set role to bypassrls role: ' || dangerous_names;
        end if;
      end if;

      begin
        insert into public.kelvin_intake_receipts (task_id, agent, state)
        values ('kelvin-contract-probe', 'CONTRACT', 'forged');
        raise exception 'kelvin contract probe rollback' using errcode = 'P0001';
      exception
        when check_violation then
          forged_blocked := true;
        when sqlstate 'P0001' then
          forged_blocked := false;
        when others then
          probe_error := SQLERRM;
      end;
      if probe_error is not null then
        return 'unexpected probe error: ' || probe_error;
      end if;
      if not forged_blocked then
        return 'state check accepts forged';
      end if;
      return 'ok';
    end
    $fn$
  $create_v3$;

  execute 'revoke all on function public.kelvin_intake_receipt_contract_v3() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.kelvin_intake_receipt_contract_v3() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.kelvin_intake_receipt_contract_v3() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.kelvin_intake_receipt_contract_v3() to service_role';
  end if;

  if to_regprocedure('public.kelvin_intake_receipt_contract_v2()') is not null then
    execute $replace_v2$
      create or replace function public.kelvin_intake_receipt_contract_v2()
      returns text
      language sql
      volatile
      security invoker
      set search_path = pg_catalog, public
      as $v2$ select public.kelvin_intake_receipt_contract_v3() $v2$
    $replace_v2$;
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
  end if;

  reason := public.kelvin_intake_receipt_contract_v3();
  if reason is distinct from 'ok' then
    raise exception 'kelvin intake receipt contract failed: %', reason;
  end if;
end
$migration$;
