-- Upgrade a database where 0120 through 0131 have already committed.
-- The only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0132.sql
-- Do not run this file with autocommit. This repository does not run it.
-- A fresh database uses scripts/crm-apply-bundle.sql instead.
-- This file does not schedule a job and does not send email.

\set ON_ERROR_STOP on
\ir ../supabase/migrations/0132_crm_bond_intake.sql
