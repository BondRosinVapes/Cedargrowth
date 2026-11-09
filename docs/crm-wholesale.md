# Internal wholesale CRM

Draft only. This change does not apply migrations, does not merge, and does not change production aliases, env, or the Bond site.

## Mapping checked before the change

- GitHub `BondRosinVapes/Cedargrowth` id `1314298314` matches this checkout.
- Supabase `gncuknpulgzqnpxtxtry` is the existing CedarGrowth project. No table was altered and no row was read for seeding.
- Vercel project `prj_0fgEkvhCGUZedKxopWOk39VwuNRs` was not visible to this session. The only visible team project was unrelated. No deploy, alias, or env edit was made.

## Routes and who can see them

| Surface | Route | Who sees data |
| --- | --- | --- |
| Sales sign-in | `/sales/signin` (`https://cedargrowth.vercel.app/sales/signin`) | Public form. A password match does not grant access. |
| Internal desk | `/admin/crm` (`https://cedargrowth.vercel.app/admin/crm`) | Verified KELVIN owner session, or an explicit `salesperson` or `administrator` membership for the requested brand. Missing session is a 404. |
| Legacy wholesale path | `/wholesale` | Existing 308 redirect to `/manufacturing`. Unchanged. |
| Wholesale section | `/manufacturing` | Public marketing page. Signals render only for a CedarGrowth grant: the KELVIN owner, or a CedarGrowth salesperson or administrator membership. |
| Bond | none in this repo | No Bond file, hero, header, age gate, or deploy. A future Bond hyperlink, placed outside the public hero, header, and age gate, may point at the desk href. The link grants no cookie and no brand. |

Practice roles, including OWNER, are not CRM permissions. There is no retailer login. A retailer audience with an empty permit list sees no intelligence. Staff-only competitor evidence and internal notes are not copied onto the public page.

The KELVIN owner session still opens both brands on the desk. A membership opens only its brands. `administrator` may export. `salesperson` may not. Counts and search follow the same brand grant. The wholesale page cannot show Bond.

No membership rows are created by this change. Later, an administrator with database access can insert one row per person and brand after that person already exists in Supabase Auth. This repo does not create the person, send mail, or run that insert.

```sql
insert into public.crm_sales_memberships (auth_user_id, brand, desk_role)
values ('<existing auth user uuid>', 'cedargrowth', 'salesperson');

update public.crm_sales_memberships
set revoked_at = now()
where auth_user_id = '<existing auth user uuid>' and brand = 'cedargrowth' and revoked_at is null;
```

## What works before Canix and Hoodie

- Admin-gated accounts, contacts, preferences, assigned-rep labels, opportunities, tasks, append-only activity, and append-only notes, once `0120` through `0123` are applied together.
- Opportunity stages are lead, qualification, licensed buyer review, proposal, won, and lost. Lost requires a loss reason. Forecast is not invoiced or paid.
- Reports return funnel, aging, and rep workload from stored rows when storage is ready. Health reports storage readiness separately from Canix and Hoodie. A missing schema is not `ok`. Missing source amounts stay null.
- An existing `0120` opportunity stage is rewritten before the new check: `qualified` to `qualification`, `committed` to `proposal` with the original token in `legacy_stage`, `closed_won` to `won`, and `closed_lost` to `lost`. A lost row with no stored reason keeps the explicit sentence `Legacy stage closed_lost. No loss reason was stored.` A stage outside that set aborts the upgrade.
- Forecast amounts are labeled forecast. Invoiced and paid amounts are null.
- If the tables or the server client are absent, the desk says storage is not configured. It does not keep a browser copy.
- Canix and Hoodie adapters are disconnected. They do not call the network.
- The signals wing and the staff block on `/manufacturing` share `signalLines`. With no verified history they report insufficient evidence, not a date or a rank.
- In-app alert review, assign, and dismiss exist for stored rows. Nothing is seeded, nothing is scheduled, and alerts cannot be activated.

## Still blocked

- Canix access, schema, entitlements, and write filters are unverified until Tuesday 10 Nov 2026 at the earliest. No live read was attempted.
- Hoodie licensing, lawful coverage, freshness, and API shape are unverified. No Hoodie call was attempted.
- Calibration, recipients, channels, and cadence are not settings. Email, text, and Slack are not sent.
- Migrations `0120`, `0121`, `0122`, and `0123` are files only. They are not applied to the hosted project. `0120`, `0121`, and `0122` are not atomic if a hosted runner commits each file and then fails. Hosted-runner atomicity is not established. The fresh-install boundary is `psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-bundle.sql`. After `0120` through `0122` have committed, the upgrade boundary is `psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0123.sql`. Both scripts sit outside `supabase/migrations`. Autocommit application is not a deployment procedure. Rollback is `docs/crm-wholesale-rollback.sql`, manual, and only after those tables exist. It drops `crm_notes` before the account tables.

## Blueprint coverage

The authoritative plan is the CedarGrowth internal CRM blueprint of 8 Nov 2026. This table is the build state, not a claim that the plan is finished.

| Blueprint item | State | What was exercised |
| --- | --- | --- |
| CedarGrowth-hosted desk, Bond hyperlink only | Implemented as `/admin/crm`. No Bond file and no hyperlink placement. | Route deny without a session. |
| Brand authorization on search, export, and counts | Implemented. Default deny. | Route tests for Bond deny, salesperson export deny, administrator export. |
| Accounts, stored license and facility references, assigned rep | Implemented. References do not certify a license. Assignment does not grant a role. | Route create and local SQL. |
| Contacts and preferences | Implemented. Storing is not consent. | Route and SQL `do_not_contact`. |
| Pipeline lead, qualification, licensed-buyer review, proposal, won, lost | Implemented, including upgrade from the prior six stage names. | Local upgrade of every prior stage. Unsupported stage aborts. |
| Forecast, expected close, loss reason, next action | Implemented. Won and forecast are not invoiced or paid. | Route rejects lost without a reason. Counts keep invoiced and paid null. |
| Tasks with owner, due date, and status | Implemented. | Route and SQL. |
| Append-only notes and activity | Implemented. Calls, meetings, and outbound messages are not separate sends. | SQL rejects note update and delete. |
| Funnel, aging, rep workload | Implemented from stored rows when storage is ready. Cross-brand totals are not offered. | Mixed-brand funnel fails closed. |
| Source health and freshness | Adapter disconnection is separate from storage readiness. Last success is null. | Health returns 503 when storage is absent and 200 with `storage: ready` when it is not. Both keep Canix and Hoodie disconnected. |
| Read-only Canix mirror, orders, invoices, payments | Blocked. No endpoint is called and no schema was verified. | Adapter test replaces `fetch` and records no call. |
| Hoodie, Metrc, Headset, LeafLink | Blocked or out of this build. Hoodie is unverified. BDSA stays declined. Headset and LeafLink are phase 2. | No client for those sources. |
| Historical import, webhooks, polling, deletions, reconciliation | Deferred. No sync job exists. | No schedule was added. |
| Provenance on imported fields | Deferred with import. The field registry marks Canix and Hoodie fields not editable and not connected. | Registry self-test. |
| Retention, correction, and deletion policy | Deferred. Notes cannot be deleted by this desk. | Delete trigger. |
| Alerts, auto orders, outbound messages | Inactive. No activation path. | Alert activation is rejected. |
| Phase 0 and phase 1 evidence | Blocked until Canix access and a verified schema. | No hosted CRM migration was applied. |
- LITMUS, SENTINEL, VERNIER, and Gary's candidate approval have not been passed by this change.

## Storage risk

`supabase db push` on a machine linked to `gncuknpulgzqnpxtxtry` would apply these files if they are the pending migrations. Do not run that as part of preview. Service-role access still requires the route to accept the KELVIN session first. RLS denies `anon` and `authenticated`. There is no policy that opens the rows to the Data API.
