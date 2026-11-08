-- Kelvin intake receipts. Draft only: do not apply this from the pull request.
-- Apply it in a reviewed step, confirm task_id is the primary key, then set
-- CEDARGROWTH_KELVIN_INTAKE_RECEIPTS=verified. Until that verification, the
-- intake route stays unconfigured and does not call the webhook.
--
-- task_id is the cross-request reservation. A second insert of the same id
-- fails, so only one outbound proposal can be claimed. The console event
-- route cannot write this table.

create table if not exists public.kelvin_intake_receipts (
  task_id text primary key,
  agent text not null,
  state text not null check (state in ('reserved', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kelvin_intake_receipts enable row level security;

revoke all on table public.kelvin_intake_receipts from public, anon, authenticated;
grant select, insert, update on table public.kelvin_intake_receipts to service_role;
