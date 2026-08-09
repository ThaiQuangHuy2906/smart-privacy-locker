# Supabase Phase 2 setup

Apply migrations in lexical order to a clean development project. The schema
creates `profiles`, `lockers`, owner-only RLS, automatic profiles, two sanitized
pre-provisioned lockers, and the authenticated atomic `claim_locker` RPC.

```powershell
supabase db reset
supabase test db supabase/tests/phase2_claim_rls.sql
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

The development project is configured outside Git, but this workstation has no
Supabase CLI, `psql`, or local Docker/Postgres runner. Apply the ordered SQL in
the Supabase SQL Editor, then keep P2-M03–P2-M05 manual HARD-GATE Pending until
the disposable User A/User B cases below have sanitized browser/API/database
evidence. Static migration contract checks run in the Node test suite; they are
not represented as database/RLS runtime evidence.
