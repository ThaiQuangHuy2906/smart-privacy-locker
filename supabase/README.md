# Supabase Phase 2 setup

Apply migrations in lexical order to a clean development project. The schema
creates `profiles`, `lockers`, owner-only RLS, automatic profiles, two sanitized
pre-provisioned lockers, and the authenticated atomic `claim_locker` RPC.

```powershell
supabase db reset
supabase test db supabase/tests/phase2_claim_rls.sql
```

The browser uses only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It cannot update
`lockers.owner_id`: no client update policy exists. Claim is a single conditional
`UPDATE ... WHERE owner_id IS NULL` inside a `SECURITY DEFINER` function whose
search path is fixed; execution is granted only to `authenticated`.

The current workstation has no Supabase CLI/project credentials, so the SQL
integration procedure is supplied but must remain manual HARD-GATE Pending until
P2-M03–P2-M05 are executed with disposable User A/User B accounts and sanitized
evidence. Static migration contract checks run in the Node test suite; they are
not represented as database/RLS runtime evidence.
