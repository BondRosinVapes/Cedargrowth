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

- Admin-gated accounts, contacts, opportunities, tasks, and append-only activity, once migration `0120` is applied by a later reviewed step.
- Forecast amounts are labeled forecast. Invoiced and paid amounts are null.
- If the tables or the server client are absent, the desk says storage is not configured. It does not keep a browser copy.
- Canix and Hoodie adapters are disconnected. They do not call the network.
- The signals wing and the staff block on `/manufacturing` share `signalLines`. With no verified history they report insufficient evidence, not a date or a rank.
- In-app alert review, assign, and dismiss exist for stored rows. Nothing is seeded, nothing is scheduled, and alerts cannot be activated.

## Still blocked

- Canix access, schema, entitlements, and write filters are unverified until Tuesday 10 Nov 2026 at the earliest. No live read was attempted.
- Hoodie licensing, lawful coverage, freshness, and API shape are unverified. No Hoodie call was attempted.
- Calibration, recipients, channels, and cadence are not settings. Email, text, and Slack are not sent.
- Migrations `0120` and `0121` are files only. Applying them creates empty tables and new RLS. It does not change existing tables. Rollback is `docs/crm-wholesale-rollback.sql`, manual, and only after those migrations exist in the database.
- LITMUS, SENTINEL, VERNIER, and Gary's candidate approval have not been passed by this change.

## Storage risk

`supabase db push` on a machine linked to `gncuknpulgzqnpxtxtry` would apply these files if they are the pending migrations. Do not run that as part of preview. Service-role access still requires the route to accept the KELVIN session first. RLS denies `anon` and `authenticated`. There is no policy that opens the rows to the Data API.
