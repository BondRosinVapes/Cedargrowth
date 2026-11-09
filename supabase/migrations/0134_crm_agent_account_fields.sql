-- Extend the agent account writer. Depends on 0133.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0133 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0134.sql
-- Do not apply this file with autocommit. This repository does not run it.
-- No seed rows. The route stays off until AGENT_INTAKE_ENABLED is set.

do $$
begin
  if to_regprocedure('public.crm_receive_agent_records(uuid, timestamptz, jsonb)') is null then
    raise exception 'agent intake is missing. Apply 0133 first.';
  end if;
end $$;

create or replace function public.crm_receive_agent_records(
  p_request_id uuid,
  p_received_at timestamptz,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  row_index integer;
  created_accounts integer := 0;
  created_contacts integer := 0;
  created_notes integer := 0;
  skipped jsonb := '[]'::jsonb;
  failed jsonb := '[]'::jsonb;
  linked_id uuid;
  license text;
  account_name text;
  hits integer;
begin
  if exists (select 1 from public.crm_agent_requests where request_id = p_request_id) then
    return jsonb_build_object('ok', false, 'code', 'replay');
  end if;
  if (
    select count(*) from public.crm_agent_requests
    where actor = 'CODEX agent' and received_at > p_received_at - interval '1 hour' and received_at <= p_received_at
  ) >= 20 then
    return jsonb_build_object('ok', false, 'code', 'rate');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then
    return jsonb_build_object('ok', false, 'code', 'oversize');
  end if;
  insert into public.crm_agent_requests (request_id, actor, received_at) values (p_request_id, 'CODEX agent', p_received_at);
  for item in select value from jsonb_array_elements(p_rows) loop
    row_index := coalesce((item->>'index')::integer, 0);
    if item->>'op' = 'account' then
      license := nullif(btrim(coalesce(item->>'license_number', '')), '');
      if license is not null and exists (
        select 1 from public.crm_accounts
        where brand = 'cedargrowth' and license_ref is not null and lower(btrim(license_ref)) = lower(license)
      ) then
        skipped := skipped || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'An account with this license number already exists.'));
      else
        insert into public.crm_accounts (
          brand, display_name, status, city, county, state, street, postal_code, license_ref, license_expiry,
          assigned_rep, account_type, lead_source, ocm_status, notes, source_request_id, created_by, updated_by
        ) values (
          'cedargrowth',
          item->>'display_name',
          item->>'status',
          nullif(item->>'city', ''),
          nullif(item->>'county', ''),
          'NY',
          nullif(btrim(coalesce(item->>'street', '')), ''),
          nullif(btrim(coalesce(item->>'postal_code', '')), ''),
          license,
          nullif(item->>'license_expiry', '')::date,
          nullif(item->>'assigned_rep', ''),
          nullif(item->>'account_type', ''),
          nullif(item->>'lead_source', ''),
          nullif(item->>'ocm_status', ''),
          coalesce(item->>'notes', ''),
          p_request_id,
          'CODEX agent',
          'CODEX agent'
        );
        created_accounts := created_accounts + 1;
      end if;
    elsif item->>'op' = 'contact' or item->>'op' = 'note' then
      license := nullif(btrim(coalesce(item->>'account_license', '')), '');
      account_name := nullif(btrim(coalesce(item->>'account_name', '')), '');
      linked_id := null;
      if license is not null then
        select count(*) into hits from public.crm_accounts
        where brand = 'cedargrowth' and license_ref is not null and lower(btrim(license_ref)) = lower(license);
        if hits = 1 then
          select id into linked_id from public.crm_accounts
          where brand = 'cedargrowth' and license_ref is not null and lower(btrim(license_ref)) = lower(license);
        elsif hits > 1 then
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'More than one account has this license number.'));
        else
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'No account with this license number.'));
        end if;
      elsif account_name is not null then
        select count(*) into hits from public.crm_accounts where brand = 'cedargrowth' and display_name = account_name;
        if hits = 1 then
          select id into linked_id from public.crm_accounts where brand = 'cedargrowth' and display_name = account_name;
        elsif hits > 1 then
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'More than one account has this name.'));
        else
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'No account with this exact name.'));
        end if;
      else
        failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'Link the row to an account by license or exact name.'));
      end if;
      if linked_id is not null and item->>'op' = 'contact' and nullif(btrim(coalesce(item->>'email', '')), '') is not null and exists (
        select 1 from public.crm_contacts
        where brand = 'cedargrowth' and crm_contacts.account_id = linked_id and email is not null and lower(btrim(email)) = lower(btrim(item->>'email'))
      ) then
        skipped := skipped || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'A contact with this email already exists on the account.'));
      elsif linked_id is not null and item->>'op' = 'contact' then
        insert into public.crm_contacts (brand, account_id, name, email, phone, title, notes, preference, source_request_id, created_by, updated_by)
        values ('cedargrowth', linked_id, item->>'name', nullif(item->>'email', ''), nullif(item->>'phone', ''), nullif(item->>'title', ''), '', 'unspecified', p_request_id, 'CODEX agent', 'CODEX agent');
        created_contacts := created_contacts + 1;
      elsif linked_id is not null and item->>'op' = 'note' then
        insert into public.crm_notes (brand, account_id, body, actor, source_request_id)
        values ('cedargrowth', linked_id, item->>'body', 'CODEX agent', p_request_id);
        created_notes := created_notes + 1;
      end if;
    else
      failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'This writer cannot create that record.'));
    end if;
  end loop;
  return jsonb_build_object(
    'ok', true,
    'code', 'accepted',
    'created', jsonb_build_object('accounts', created_accounts, 'contacts', created_contacts, 'notes', created_notes),
    'skipped', skipped,
    'failed', failed
  );
end;
$$;

revoke all on function public.crm_receive_agent_records(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.crm_receive_agent_records(uuid, timestamptz, jsonb) to service_role;
