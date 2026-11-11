-- Read-only check after applying 0138. This file does not change the database.
-- Run it as any role that can read pg_proc:
--   psql -v ON_ERROR_STOP=1 -f scripts/crm-check-0138-rls.sql
-- 0138 forces row level security on supplier intake and adds no policies.
-- The security definer functions write those rows as their owner, so each
-- owner must still bypass forced row level security. If this raises, the
-- apply is not safe.

do $$
declare
  v_name text;
  v_owner name;
  v_super boolean;
  v_bypass boolean;
  v_found integer := 0;
begin
  foreach v_name in array array[
    'crm_receive_supplier_inquiry',
    'crm_delete_supplier_inquiry',
    'crm_purge_supplier_inquiries',
    'crm_mark_supplier_replied'
  ]
  loop
    select r.rolname, r.rolsuper, r.rolbypassrls
      into v_owner, v_super, v_bypass
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.proname = v_name
    limit 1;
    if v_owner is null then
      raise exception '0138 function % is missing. The post-apply check failed.', v_name;
    end if;
    v_found := v_found + 1;
    if coalesce(v_super, false) or coalesce(v_bypass, false) then
      raise notice '0138 function % owner % can bypass forced row level security', v_name, v_owner;
    else
      raise exception '0138 function % owner % cannot bypass forced row level security. The post-apply check failed.', v_name, v_owner;
    end if;
  end loop;
  if v_found <> 4 then
    raise exception '0138 post-apply check found % functions, expected 4.', v_found;
  end if;
end $$;
