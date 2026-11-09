-- Upgrade a database where 0120 through 0127 have already committed.
-- The only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0128.sql
-- Do not run this file with autocommit. This repository does not run it.
-- A fresh database uses scripts/crm-apply-bundle.sql instead.
-- This file does not create the Storage bucket.

\set ON_ERROR_STOP on
\ir ../supabase/migrations/0128_crm_batches_reorder.sql
