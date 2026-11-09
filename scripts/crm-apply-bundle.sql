-- Apply CRM migrations 0120 through 0127 as one transaction.
-- This file is not in supabase/migrations, so a hosted migration runner does not
-- pick it up by itself. Run it only with psql --single-transaction against an
-- isolated database after review. This repository does not run it.
-- A failure anywhere rolls the whole bundle back, including tables created
-- before row level security in an earlier file.

\set ON_ERROR_STOP on
\ir ../supabase/migrations/0120_crm_internal_wholesale.sql
\ir ../supabase/migrations/0121_crm_sales_intelligence.sql
\ir ../supabase/migrations/0122_crm_sales_membership.sql
\ir ../supabase/migrations/0123_crm_suite_workflows.sql
\ir ../supabase/migrations/0124_crm_account_source_type.sql
\ir ../supabase/migrations/0125_crm_distributor_orders.sql
\ir ../supabase/migrations/0126_crm_production_forecast.sql
\ir ../supabase/migrations/0127_crm_field_visits.sql
