begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text null check (full_name is null or char_length(full_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lockers (
  id uuid primary key default gen_random_uuid(),
  locker_code text not null unique check (locker_code ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  owner_id uuid null references auth.users(id) on delete restrict,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint lockers_claim_consistency check (
    (owner_id is null and claimed_at is null) or
    (owner_id is not null and claimed_at is not null)
  )
);

create index lockers_owner_id_idx on public.lockers(owner_id) where owner_id is not null;

alter table public.profiles enable row level security;
alter table public.lockers enable row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy profiles_update_self on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy lockers_select_owned on public.lockers
  for select to authenticated using (owner_id = auth.uid());

-- There is intentionally no client INSERT/UPDATE/DELETE policy on lockers.
-- In particular, a browser cannot assign or replace owner_id directly.

commit;
