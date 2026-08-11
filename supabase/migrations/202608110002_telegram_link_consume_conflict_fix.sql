begin;

-- Forward-fix deployments that already applied 202608110001. The
-- consume_telegram_link function returns a TABLE column named locker_id, so
-- PL/pgSQL can treat ON CONFLICT (locker_id) as ambiguous. Naming the primary
-- key constraint removes that variable/column resolution entirely.
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

revoke all privileges on function public.consume_telegram_link(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_telegram_link(text, text, text, text)
  to service_role;

commit;
