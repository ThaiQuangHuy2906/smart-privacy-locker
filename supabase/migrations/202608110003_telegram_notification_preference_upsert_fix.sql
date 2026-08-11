begin;

-- Forward fix for projects that already applied 202608110001.
-- PostgreSQL validates CHECK constraints on the proposed INSERT row before it
-- enters ON CONFLICT DO UPDATE. Carry the existing private Telegram route into
-- that proposed row so re-enabling a linked channel satisfies the constraint.
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

revoke all privileges on function public.update_notification_preferences(
  text, uuid, boolean, boolean, text, time, text
) from public, anon, authenticated;
grant execute on function public.update_notification_preferences(
  text, uuid, boolean, boolean, text, time, text
) to service_role;

commit;
