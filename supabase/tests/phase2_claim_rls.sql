-- Run after `supabase db reset` against a disposable local project. This file
-- does not contain production users or data. It exercises database behavior
-- under request JWT claims without using the service role in a browser.
begin;

-- `supabase test db` executes SQL files through pg_prove, so emit a valid
-- pgTAP plan/result while retaining the detailed exception-based checks below.
create extension if not exists pgtap with schema extensions;
select plan(1);

-- The locker owner foreign key points at auth.users. Create disposable local
-- Auth rows so this script runs on a clean `supabase db reset` instead of only
-- passing a static migration scan. The enclosing transaction is rolled back.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase2-user-a@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"User A"}', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase2-user-b@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

do $$
declare
  user_a constant uuid := '20000000-0000-4000-8000-000000000001';
  user_b constant uuid := '20000000-0000-4000-8000-000000000002';
  claimed_owner uuid;
  profile_name text;
  updated_count integer;
  visible_count integer;
begin
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'authenticated cannot select its RLS-filtered profile';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') then
    raise exception 'authenticated cannot update its own profile name';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE') then
    raise exception 'authenticated received excessive profile update privileges';
  end if;
  if not has_table_privilege('authenticated', 'public.lockers', 'SELECT')
     or has_table_privilege('authenticated', 'public.lockers', 'INSERT, UPDATE, DELETE') then
    raise exception 'authenticated locker table privileges violate the read-only contract';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.lockers', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'anon received access to protected Phase 2 tables';
  end if;
  if not has_function_privilege('authenticated', 'public.claim_locker(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_locker(text)', 'EXECUTE') then
    raise exception 'claim_locker execute privileges violate the authenticated-only contract';
  end if;
  if has_function_privilege('authenticated', 'public.create_profile_for_new_user()', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_profile_for_new_user()', 'EXECUTE') then
    raise exception 'profile trigger function is exposed as a client RPC';
  end if;

  select full_name into profile_name from public.profiles where user_id = user_a;
  if profile_name is distinct from 'User A' then raise exception 'signup metadata did not populate profile'; end if;

  -- auth.uid() reads this claim in Supabase/PostgREST sessions.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  set local role authenticated;
  update public.profiles set full_name = 'User A Updated' where user_id = user_a;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'User A could not update its own profile name'; end if;
  update public.profiles set full_name = 'Forbidden' where user_id = user_b;
  get diagnostics updated_count = row_count;
  if updated_count <> 0 then raise exception 'User A updated User B profile'; end if;

  select owner_id into claimed_owner from public.claim_locker('LOCKER-001');
  if claimed_owner is distinct from user_a then raise exception 'first claim did not assign User A'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', user_b::text, true);
  set local role authenticated;
  begin
    perform public.claim_locker('LOCKER-001');
    raise exception 'double claim unexpectedly succeeded';
  exception when sqlstate 'P0001' then null;
  end;

  select count(*) into visible_count from public.lockers where locker_code = 'LOCKER-001';
  if visible_count <> 0 then raise exception 'User B can read Locker A'; end if;
  reset role;
end;
$$;

select pass('Phase 2 profile, ownership, claim, RLS, and grant contract');
select * from finish();

rollback;
