-- Upgrade a database where 0120 through 0136 have already committed.
-- The only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0138.sql
-- Do not run this file with autocommit. This repository does not run it.
-- A fresh database uses scripts/crm-apply-bundle.sql instead.

\set ON_ERROR_STOP on
\ir ../supabase/migrations/0138_crm_card_and_supplier_intake.sql
