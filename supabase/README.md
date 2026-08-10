# Supabase Phase 2 + Phase 3 setup

Apply migrations in lexical order to a clean development project. The schema
creates Phase 2 `profiles`/`lockers`/claim support, then Phase 3
`device_events`, `notification_settings` and `notification_deliveries`.

```powershell
supabase db reset
supabase test db supabase/tests/phase2_claim_rls.sql
supabase test db supabase/tests/phase3_data_rls.sql
```

The SQL test is a pgTAP file with an explicit `plan`, assertion, `finish()`, and
transaction rollback, so the documented `supabase test db` command can execute
it through the CLI's database-test runner instead of treating a procedural
`DO` block as sufficient evidence.

The browser uses only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It cannot update
`lockers.owner_id`: no client update policy exists. Claim is a single conditional
`UPDATE ... WHERE owner_id IS NULL` inside a `SECURITY DEFINER` function whose
search path is fixed; execution is granted only to `authenticated`.

Data API privileges are explicit: `anon` has no access to either protected
table or the claim RPC; `authenticated` can select RLS-visible profile/locker
rows, update only `profiles.full_name`, and execute `claim_locker(text)`.

Phase 3 browser grants are least-privilege: authenticated owners can read their
event/delivery rows and read/write only their own notification settings. Only
the backend service role inserts normalized events and delivery results.
`event_id` is the idempotency key; `(locker_id, channel, report_key)` prevents a
daily report from being reserved twice.

Apply the ordered SQL through Supabase CLI or SQL Editor. The committed pgTAP
tests and Node static checks are reproducible software evidence, but do not
replace a sanitized two-user run against the selected Supabase project. Never
place a service-role key in Dashboard code or migration evidence.
