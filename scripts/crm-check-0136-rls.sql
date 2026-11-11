-- Read-only check before applying 0136. This file does not change the database.
-- Run it as the role that will own the security definer functions:
--   psql -v ON_ERROR_STOP=1 -f scripts/crm-check-0136-rls.sql
-- 0136 forces row level security on its tables and adds no policies.
-- Those functions read and write CRM rows as their owner, so that owner
-- must bypass forced row level security. If this raises, do not apply 0136
-- as this role. Use a superuser or a role with BYPASSRLS.

do $$
declare
  v_super boolean;
  v_bypass boolean;
begin
  select rolsuper, rolbypassrls into v_super, v_bypass
  from pg_catalog.pg_roles
  where rolname = current_user;
  if coalesce(v_super, false) or coalesce(v_bypass, false) then
    raise notice '0136 function owner % can bypass forced row level security', current_user;
    return;
  end if;
  raise exception '0136 function owner % cannot bypass forced row level security. Do not apply 0136 as this role.', current_user;
end $$;
