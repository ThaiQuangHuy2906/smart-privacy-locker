begin;

-- Supabase projects no longer expose newly-created tables to Data API roles
-- implicitly. Keep the browser contract explicit and least-privileged:
-- authenticated users can read only rows allowed by RLS, can edit only their
-- own profile name, and must claim lockers through the atomic RPC.
revoke all privileges on table public.profiles, public.lockers
  from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
grant select on table public.lockers to authenticated;

-- Reassert the RPC boundary in this forward migration so environments that
-- applied older migrations receive the same executable privilege contract.
revoke all privileges on function public.claim_locker(text)
  from public, anon, authenticated;
grant execute on function public.claim_locker(text) to authenticated;

-- Trigger functions do not form part of the browser-facing RPC surface.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, so remove
-- that implicit privilege while leaving the function owner able to run it.
revoke all privileges on function public.create_profile_for_new_user()
  from public, anon, authenticated;

commit;
