-- Upgrade a database where 0120 through 0136 have already committed.
-- The only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0139.sql
-- Do not run this file with autocommit. This repository does not run it.

\set ON_ERROR_STOP on
\ir ../supabase/migrations/0139_crm_bond_request_handoff.sql
