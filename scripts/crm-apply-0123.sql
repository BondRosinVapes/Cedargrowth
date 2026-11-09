-- Upgrade a database where 0120, 0121, and 0122 have already committed.
-- The only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0123.sql
-- Do not run this file with autocommit. This repository does not run it.
-- A fresh database uses scripts/crm-apply-bundle.sql instead.

\set ON_ERROR_STOP on
\ir ../supabase/migrations/0123_crm_suite_workflows.sql
