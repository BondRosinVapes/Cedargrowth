-- Apply 0142 as one transaction. Prepared only. Do not apply from CI.
-- This repository does not run it. Do not apply it to a hosted database from here.
-- 0120 through 0141 are already applied and are not included.

begin;

\ir ../supabase/migrations/0142_market_intel_hoodie.sql

commit;
