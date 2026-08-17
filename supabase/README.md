# Supabase Phase 2 + Phase 3 setup

> Audit snapshot 2026-08-17: SQL/migration/RLS source and automated contracts
> were reviewed; no confirmed P0 finding was found. This audit did not run
> `db reset`, pgTAP or disposable cross-owner live gates against an external
> project. Historical evidence remains historical—rerun the release candidate
> sequence in
> [../HUONG_DAN_TEST_END_TO_END.md](../HUONG_DAN_TEST_END_TO_END.md) on an
> explicitly identified test project.

Apply migrations in lexical order to a clean development project. The schema
creates Phase 2 `profiles`/`lockers`/claim support, then Phase 3
`device_events`, `notification_settings` and `notification_deliveries`, then
the automatic Telegram private-account link boundary.

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
event, setting and delivery rows, but notification-setting writes go through
the Bearer + ownership-gated Node-RED route. This prevents direct Data API
writes from bypassing the runtime validator. Only the backend service role
inserts normalized events, saves settings and transitions deliveries.
`event_id` is the event idempotency key; generated `report_date` plus
`(locker_id, channel, report_date)` prevents a daily report from being reserved
twice across equivalent timezone aliases.

`202608110001_telegram_account_linking.sql` moves Telegram routing entirely
behind Node-RED, and `202608110002_telegram_link_consume_conflict_fix.sql`
qualifies the consume RPC's primary-key conflict target for PostgreSQL's
PL/pgSQL name resolver. The subsequent
`202608110003_telegram_notification_preference_upsert_fix.sql` carries an
existing private Telegram route through INSERT constraint validation when a
linked owner updates or re-enables notification preferences. Authenticated users can select only non-sensitive
`notification_settings` columns; Chat/User IDs are excluded from their column
grants. `telegram_link_tokens` stores only a SHA-256 digest, expires each link
after 10 minutes, permits at most one active owner/locker link and grants no
browser access. Issue, consume, disconnect and preference-update RPCs are
`SECURITY DEFINER` with fixed search paths and executable only by
`service_role`; Node-RED supplies the owner UUID only after its canonical
Bearer + ownership check.

For an existing Phase 3 deployment, apply
`202608100002_phase3_scheduler_delivery_hardening.sql` before deploying the new
Node-RED runtime, followed by `202608110001_telegram_account_linking.sql` and
`202608110002_telegram_link_consume_conflict_fix.sql` and
`202608110003_telegram_notification_preference_upsert_fix.sql` before deploying
automatic Telegram linking. A database that already applied `110001` and
`110002` applies only `110003`; it must not rerun the non-idempotent schema migration. The migrations validate existing
timezone/report-key and legacy private-chat data and abort without deleting
rows if remediation is required. The preferred
application rollback is to redeploy the previous FlowFuse bundle while leaving
this additive schema and its safer browser grants in place; the previous writer
remains compatible with the generated date and expanded statuses. Do not drop
delivery evidence or remove the canonical unique key merely to roll back
application code. A schema down-migration, if ever required, needs a separate
maintenance-window data audit and is not part of the emergency rollback path.

Apply the ordered SQL through Supabase CLI or SQL Editor. The committed pgTAP
tests and Node static checks are reproducible software evidence, but do not
replace a sanitized two-user run against the selected Supabase project. The
development project completed that disposable-user P3-M04 run on 2026-08-10;
new/reset projects must repeat it. Never place a service-role key in Dashboard
code or migration evidence.
