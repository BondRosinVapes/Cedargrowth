-- Roll back 0142 only. Drops the market_intel schema and its functions.
-- Does not change crm tables. Do not run this from the app.

begin;

drop function if exists public.hoodie_stage_import(jsonb);
drop function if exists public.hoodie_publish_import(uuid, text);
drop function if exists public.hoodie_match_resolutions();
drop function if exists public.hoodie_resolve_match(text, text, uuid, text);
drop schema if exists market_intel cascade;

commit;
