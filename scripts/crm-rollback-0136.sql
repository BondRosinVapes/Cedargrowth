-- Roll back only what 0136 creates. Do not run this from the app.
-- Review it, then the only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-rollback-0136.sql
-- crm_private.guard_contact existed before 0136. This restores the 0120 body.
-- It does not drop that function, and it does not drop any earlier CRM table.

drop trigger if exists crm_distribution_merges_append_only on public.crm_distribution_merges;
drop function if exists public.crm_undo_distribution_merge(uuid, text, timestamptz);
drop function if exists public.crm_merge_won_distribution(uuid, text);
drop function if exists public.crm_guard_distribution_merge();
drop table if exists public.crm_google_places;
drop table if exists public.crm_distribution_merges;

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
