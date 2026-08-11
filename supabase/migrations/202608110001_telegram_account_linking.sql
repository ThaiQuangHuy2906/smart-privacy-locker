begin;

-- Telegram destinations are linked by a short-lived, single-use token. The
-- browser never reads or writes chat IDs, and only the backend service role can
-- issue, consume, or revoke a link.
alter table public.notification_settings
  add column telegram_user_id text null,
  add column telegram_username text null,
  add column telegram_linked_at timestamptz null;

alter table public.notification_settings
  add constraint notification_settings_telegram_user_id_check check (
    telegram_user_id is null or telegram_user_id ~ '^[1-9][0-9]{0,19}$'
  ),
  add constraint notification_settings_telegram_username_check check (
    telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{5,32}$'
  ),
  add constraint notification_settings_telegram_link_consistency check (
    (telegram_enabled = false and telegram_chat_id is null
      and telegram_user_id is null and telegram_linked_at is null)
    or
    (telegram_chat_id is not null and telegram_user_id is not null and telegram_linked_at is not null)
  ) not valid;

-- Preserve deployments that already configured a private Chat ID manually.
-- Telegram private chat IDs equal their user IDs; the migration deliberately
-- refuses non-private/group destinations instead of silently reusing them.
update public.notification_settings
set telegram_user_id = telegram_chat_id,
    telegram_linked_at = coalesce(updated_at, now())
where telegram_chat_id ~ '^[1-9][0-9]{0,19}$'
  and telegram_user_id is null
  and telegram_linked_at is null;

-- Repair legacy rows that enabled Telegram without a usable destination.
update public.notification_settings
set telegram_enabled = false
where telegram_chat_id is null;

do $$
begin
  if exists (
    select 1
    from public.notification_settings
    where telegram_chat_id is not null
      and (telegram_user_id is null or telegram_linked_at is null)
  ) then
    raise exception using
      errcode = '22023',
      message = 'TELEGRAM_LEGACY_DESTINATION_NOT_PRIVATE';
  end if;
end;
$$;

alter table public.notification_settings
  validate constraint notification_settings_telegram_link_consistency;

-- Owners may inspect ordinary preferences through RLS, but provider routing
-- identifiers stay backend-only even when a client bypasses the Dashboard and
-- calls the Supabase Data API directly.
revoke select on table public.notification_settings from authenticated;
grant select (
  locker_id, telegram_enabled, telegram_username, telegram_linked_at,
  email_enabled, email_address, report_time, timezone, created_at, updated_at
) on table public.notification_settings to authenticated;

create table public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  locker_id text not null references public.lockers(locker_code)
    on update cascade on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint telegram_link_tokens_expiry_check check (expires_at > created_at)
);

create index telegram_link_tokens_owner_locker_idx
  on public.telegram_link_tokens(owner_id, locker_id, created_at desc);
create unique index telegram_link_tokens_one_active_idx
  on public.telegram_link_tokens(locker_id)
  where consumed_at is null;
create index telegram_link_tokens_expiry_idx
  on public.telegram_link_tokens(expires_at)
  where consumed_at is null;

alter table public.telegram_link_tokens enable row level security;
revoke all privileges on table public.telegram_link_tokens
  from public, anon, authenticated;
grant all privileges on table public.telegram_link_tokens to service_role;

create or replace function public.issue_telegram_link(
  p_locker_id text,
  p_owner_id uuid,
  p_token_hash text
)
returns table(expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  issued_expires_at timestamptz := clock_timestamp() + interval '10 minutes';
begin
  if p_locker_id is null or p_owner_id is null
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_TELEGRAM_LINK_REQUEST';
  end if;

  if not exists (
    select 1 from public.lockers
    where locker_code = p_locker_id and owner_id = p_owner_id
  ) then
    raise exception using errcode = '42501', message = 'LOCKER_FORBIDDEN';
  end if;

  -- Serialize repeated clicks/browser tabs and keep storage bounded to at most
  -- one token row per locker. Re-issuing also invalidates a stale previous
  -- owner's token after locker ownership changes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_locker_id, 0)
  );
  delete from public.telegram_link_tokens
  where locker_id = p_locker_id;

  insert into public.telegram_link_tokens(token_hash, locker_id, owner_id, expires_at)
  values (p_token_hash, p_locker_id, p_owner_id, issued_expires_at);

  return query select issued_expires_at;
end;
$$;

create or replace function public.consume_telegram_link(
  p_token_hash text,
  p_chat_id text,
  p_telegram_user_id text,
  p_username text default null
)
returns table(locker_id text, telegram_username text, linked_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  link public.telegram_link_tokens%rowtype;
  candidate_locker_id text;
  normalized_username text := nullif(trim(p_username), '');
  linked_time timestamptz := clock_timestamp();
  replay_username text;
  replay_linked_at timestamptz;
  replay_matches boolean := false;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_chat_id !~ '^[1-9][0-9]{0,19}$'
     or p_telegram_user_id !~ '^[1-9][0-9]{0,19}$'
     or p_chat_id <> p_telegram_user_id
     or (normalized_username is not null
         and normalized_username !~ '^[A-Za-z0-9_]{5,32}$') then
    raise exception using errcode = '22023', message = 'INVALID_TELEGRAM_LINK_UPDATE';
  end if;

  -- Resolve the locker without locking the row, then acquire the locker-scoped
  -- advisory lock before any row lock. Issue, consume, and disconnect therefore
  -- share one lock order and cannot deadlock each other.
  select token_row.locker_id into candidate_locker_id
  from public.telegram_link_tokens as token_row
  where token_row.token_hash = p_token_hash
    and token_row.expires_at > linked_time;

  if not found then
    raise exception using errcode = 'P0001', message = 'TELEGRAM_LINK_INVALID_OR_EXPIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(candidate_locker_id, 0)
  );

  select * into link
  from public.telegram_link_tokens
  where token_hash = p_token_hash
    and expires_at > linked_time
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'TELEGRAM_LINK_INVALID_OR_EXPIRED';
  end if;

  if not exists (
    select 1 from public.lockers
    where locker_code = link.locker_id and owner_id = link.owner_id
  ) then
    raise exception using errcode = '42501', message = 'LOCKER_OWNERSHIP_CHANGED';
  end if;

  -- Telegram can retry the same webhook when the previous HTTP response was
  -- lost after commit. Treat an exact replay by the already-linked private
  -- account as idempotent, while never allowing the token to link a different
  -- destination.
  if link.consumed_at is not null then
    select setting.telegram_username, setting.telegram_linked_at,
      setting.telegram_chat_id = p_chat_id
        and setting.telegram_user_id = p_telegram_user_id
        and setting.telegram_linked_at = link.consumed_at
    into replay_username, replay_linked_at, replay_matches
    from public.notification_settings as setting
    where setting.locker_id = link.locker_id;

    if coalesce(replay_matches, false) then
      return query select link.locker_id, replay_username, replay_linked_at;
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'TELEGRAM_LINK_INVALID_OR_EXPIRED';
  end if;

  insert into public.notification_settings (
    locker_id, telegram_enabled, telegram_chat_id, telegram_user_id,
    telegram_username, telegram_linked_at, updated_at
  ) values (
    link.locker_id, true, p_chat_id, p_telegram_user_id,
    normalized_username, linked_time, linked_time
  )
  on conflict on constraint notification_settings_pkey do update
    set telegram_enabled = true,
        telegram_chat_id = excluded.telegram_chat_id,
        telegram_user_id = excluded.telegram_user_id,
        telegram_username = excluded.telegram_username,
        telegram_linked_at = excluded.telegram_linked_at,
        updated_at = excluded.updated_at;

  update public.telegram_link_tokens
  set consumed_at = linked_time
  where id = link.id;

  return query select link.locker_id, normalized_username, linked_time;
end;
$$;

create or replace function public.disconnect_telegram(
  p_locker_id text,
  p_owner_id uuid
)
returns setof public.notification_settings
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.lockers
    where locker_code = p_locker_id and owner_id = p_owner_id
  ) then
    raise exception using errcode = '42501', message = 'LOCKER_FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_locker_id, 0)
  );
  delete from public.telegram_link_tokens
  where locker_id = p_locker_id;

  return query
  update public.notification_settings
  set telegram_enabled = false,
      telegram_chat_id = null,
      telegram_user_id = null,
      telegram_username = null,
      telegram_linked_at = null,
      updated_at = clock_timestamp()
  where locker_id = p_locker_id
  returning *;
end;
$$;

create or replace function public.update_notification_preferences(
  p_locker_id text,
  p_owner_id uuid,
  p_telegram_enabled boolean,
  p_email_enabled boolean,
  p_email_address text,
  p_report_time time,
  p_timezone text
)
returns setof public.notification_settings
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  existing public.notification_settings%rowtype;
  setting_exists boolean;
begin
  if not exists (
    select 1 from public.lockers
    where locker_code = p_locker_id and owner_id = p_owner_id
  ) then
    raise exception using errcode = '42501', message = 'LOCKER_FORBIDDEN';
  end if;

  select * into existing
  from public.notification_settings
  where locker_id = p_locker_id
  for update;
  setting_exists := found;

  if coalesce(p_telegram_enabled, false)
     and (not setting_exists or existing.telegram_chat_id is null
          or existing.telegram_user_id is null
          or existing.telegram_linked_at is null) then
    raise exception using errcode = 'P0001', message = 'TELEGRAM_NOT_LINKED';
  end if;

  return query
  insert into public.notification_settings (
    locker_id, telegram_enabled,
    telegram_chat_id, telegram_user_id, telegram_username, telegram_linked_at,
    email_enabled, email_address, report_time, timezone, updated_at
  ) values (
    p_locker_id, coalesce(p_telegram_enabled, false),
    case when setting_exists then existing.telegram_chat_id else null end,
    case when setting_exists then existing.telegram_user_id else null end,
    case when setting_exists then existing.telegram_username else null end,
    case when setting_exists then existing.telegram_linked_at else null end,
    coalesce(p_email_enabled, false), nullif(trim(p_email_address), ''),
    coalesce(p_report_time, '21:00'::time),
    coalesce(nullif(trim(p_timezone), ''), 'Asia/Ho_Chi_Minh'),
    clock_timestamp()
  )
  on conflict on constraint notification_settings_pkey do update
    set telegram_enabled = excluded.telegram_enabled,
        email_enabled = excluded.email_enabled,
        email_address = excluded.email_address,
        report_time = excluded.report_time,
        timezone = excluded.timezone,
        updated_at = excluded.updated_at
  returning *;
end;
$$;

revoke all privileges on function public.issue_telegram_link(text, uuid, text)
  from public, anon, authenticated;
revoke all privileges on function public.consume_telegram_link(text, text, text, text)
  from public, anon, authenticated;
revoke all privileges on function public.disconnect_telegram(text, uuid)
  from public, anon, authenticated;
revoke all privileges on function public.update_notification_preferences(
  text, uuid, boolean, boolean, text, time, text
) from public, anon, authenticated;

grant execute on function public.issue_telegram_link(text, uuid, text) to service_role;
grant execute on function public.consume_telegram_link(text, text, text, text) to service_role;
grant execute on function public.disconnect_telegram(text, uuid) to service_role;
grant execute on function public.update_notification_preferences(
  text, uuid, boolean, boolean, text, time, text
) to service_role;

commit;
