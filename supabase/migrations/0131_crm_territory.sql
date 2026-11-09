-- Territory, state dispensary list, and action dismissals. Depends on 0120 through 0130.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0130 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0131.sql
-- Do not apply this file with autocommit.
-- No seed rows. Region is derived from county in the application, not stored.

do $$
begin
  if to_regclass('public.crm_accounts') is null then
    raise exception 'crm_accounts is missing. Apply the bundle, not this file.';
  end if;
end $$;

alter table public.crm_accounts add column if not exists county text;
alter table public.crm_accounts drop constraint if exists crm_accounts_county_check;
alter table public.crm_accounts add constraint crm_accounts_county_check check (county is null or county in (
  'Albany', 'Allegany', 'Bronx', 'Broome', 'Cattaraugus', 'Cayuga', 'Chautauqua', 'Chemung', 'Chenango', 'Clinton',
  'Columbia', 'Cortland', 'Delaware', 'Dutchess', 'Erie', 'Essex', 'Franklin', 'Fulton', 'Genesee', 'Greene',
  'Hamilton', 'Herkimer', 'Jefferson', 'Kings', 'Lewis', 'Livingston', 'Madison', 'Monroe', 'Montgomery', 'Nassau',
  'New York', 'Niagara', 'Oneida', 'Onondaga', 'Ontario', 'Orange', 'Orleans', 'Oswego', 'Otsego', 'Putnam',
  'Queens', 'Rensselaer', 'Richmond', 'Rockland', 'St. Lawrence', 'Saratoga', 'Schenectady', 'Schoharie', 'Schuyler', 'Seneca',
  'Steuben', 'Suffolk', 'Sullivan', 'Tioga', 'Tompkins', 'Ulster', 'Warren', 'Washington', 'Wayne', 'Westchester',
  'Wyoming', 'Yates'
));

create table if not exists public.crm_territories (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  region text not null check (region in (
    'Western New York', 'Finger Lakes', 'Southern Tier', 'Central New York', 'North Country',
    'Mohawk Valley', 'Capital Region', 'Mid-Hudson', 'New York City', 'Long Island'
  )),
  rep_actor text not null check (char_length(rep_actor) between 1 and 200),
  unique (brand, region)
);

comment on table public.crm_territories is 'One assigned rep per region in a brand. Not seeded.';

create table if not exists public.crm_market_retailers (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  license_number text not null check (char_length(license_number) between 1 and 80),
  name text not null check (char_length(name) between 1 and 200),
  county text not null,
  license_type text not null check (char_length(license_type) between 1 and 120),
  uploaded_at timestamptz not null default now()
);

comment on table public.crm_market_retailers is 'Licensed retailers from a state list upload. Not seeded. Coverage uses the latest upload.';

create index if not exists crm_market_retailers_brand_uploaded_idx on public.crm_market_retailers (brand, uploaded_at desc);

create table if not exists public.crm_action_dismissals (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  rep_actor text not null check (char_length(rep_actor) between 1 and 200),
  action_key text not null check (char_length(action_key) between 1 and 160),
  until date not null,
  unique (brand, rep_actor, action_key)
);

comment on table public.crm_action_dismissals is 'Done or snoozed next actions. Hidden while today is before until. Not seeded.';

alter table public.crm_territories enable row level security;
alter table public.crm_territories force row level security;
revoke all on table public.crm_territories from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_territories to service_role;

alter table public.crm_market_retailers enable row level security;
alter table public.crm_market_retailers force row level security;
revoke all on table public.crm_market_retailers from public, anon, authenticated;
grant select, insert on table public.crm_market_retailers to service_role;
revoke update, delete on table public.crm_market_retailers from service_role, anon, authenticated, public;

alter table public.crm_action_dismissals enable row level security;
alter table public.crm_action_dismissals force row level security;
revoke all on table public.crm_action_dismissals from public, anon, authenticated;
grant select, insert, update on table public.crm_action_dismissals to service_role;
revoke delete on table public.crm_action_dismissals from service_role, anon, authenticated, public;
