begin;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(user_id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created_phase2
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.claim_locker(requested_code text)
returns table(id uuid, locker_code text, display_name text, owner_id uuid, claimed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if requested_code is null or requested_code !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$' then
    raise exception using errcode = '22023', message = 'Invalid locker code';
  end if;

  return query
  update public.lockers as locker
     set owner_id = caller, claimed_at = now()
   where locker.locker_code = requested_code
     and locker.owner_id is null
  returning locker.id, locker.locker_code, locker.display_name, locker.owner_id, locker.claimed_at;

  if not found then
    raise exception using errcode = 'P0001', message = 'Locker is invalid or already claimed';
  end if;
end;
$$;

revoke all on function public.claim_locker(text) from public, anon;
grant execute on function public.claim_locker(text) to authenticated;

-- Sanitized development provisioning. These are locker selectors, not user
-- credentials. Production provisioning may replace the inventory in an
-- environment-specific admin migration without changing the claim contract.
insert into public.lockers(locker_code, display_name) values
  ('LOCKER-001', 'Locker A'),
  ('LOCKER-002', 'Locker B')
on conflict (locker_code) do nothing;

commit;
