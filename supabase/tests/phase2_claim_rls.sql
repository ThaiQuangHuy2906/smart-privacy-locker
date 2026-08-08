-- Run after `supabase db reset` against a disposable local project. This file
-- does not contain production users or data. It exercises database behavior
-- under request JWT claims without using the service role in a browser.
begin;

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
