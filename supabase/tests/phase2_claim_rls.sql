-- Run after `supabase db reset` against a disposable local project. This file
-- does not contain production users or data. It exercises database behavior
-- under request JWT claims without using the service role in a browser.
begin;

-- The locker owner foreign key points at auth.users. Create disposable local
-- Auth rows so this script runs on a clean `supabase db reset` instead of only
-- passing a static migration scan. The enclosing transaction is rolled back.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase2-user-a@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase2-user-b@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

do $$
declare
  user_a constant uuid := '20000000-0000-4000-8000-000000000001';
  user_b constant uuid := '20000000-0000-4000-8000-000000000002';
  claimed_owner uuid;
  visible_count integer;
begin
  -- auth.uid() reads this claim in Supabase/PostgREST sessions.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  select owner_id into claimed_owner from public.claim_locker('LOCKER-001');
  if claimed_owner is distinct from user_a then raise exception 'first claim did not assign User A'; end if;

  perform set_config('request.jwt.claim.sub', user_b::text, true);
  begin
    perform public.claim_locker('LOCKER-001');
    raise exception 'double claim unexpectedly succeeded';
  exception when sqlstate 'P0001' then null;
  end;

  set local role authenticated;
  select count(*) into visible_count from public.lockers where locker_code = 'LOCKER-001';
  if visible_count <> 0 then raise exception 'User B can read Locker A'; end if;
  reset role;
end;
$$;

rollback;
