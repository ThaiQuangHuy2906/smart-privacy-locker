begin;

-- Browser clients read owner-scoped rows through RLS, but all setting writes go
-- through the Bearer + ownership gate in Node-RED. This removes the alternate
-- Data API write path that could bypass the runtime's IANA timezone validation.
revoke insert, update on table public.notification_settings from authenticated;
drop policy if exists notification_settings_insert_owned on public.notification_settings;
drop policy if exists notification_settings_update_owned on public.notification_settings;

create or replace function public.validate_notification_timezone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names
    where name = new.timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'INVALID_TIMEZONE';
  end if;
  return new;
end;
$$;

revoke all privileges on function public.validate_notification_timezone()
  from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.notification_settings setting
    where not exists (
      select 1 from pg_catalog.pg_timezone_names zone
      where zone.name = setting.timezone
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'PHASE3_INVALID_EXISTING_TIMEZONE';
  end if;
end;
$$;

drop trigger if exists notification_settings_validate_timezone
  on public.notification_settings;
create trigger notification_settings_validate_timezone
before insert or update of timezone on public.notification_settings
for each row execute function public.validate_notification_timezone();

-- Existing Phase 3 writers used YYYY-MM-DD:timezone. Validate the date prefix
-- before introducing the generated canonical key. Abort rather than deleting or
-- silently merging historical delivery evidence.
do $$
begin
  if exists (
    select 1 from public.notification_deliveries
    where report_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(:.{1,149})?$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'PHASE3_INVALID_EXISTING_REPORT_KEY';
  end if;

  if exists (
    select 1
    from public.notification_deliveries
    group by locker_id, channel, substring(report_key from 1 for 10)
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'PHASE3_DUPLICATE_EXISTING_REPORT_DATE';
  end if;
end;
$$;

alter table public.notification_deliveries
  add column report_date date generated always as (
    pg_catalog.make_date(
      substring(report_key from 1 for 4)::integer,
      substring(report_key from 6 for 2)::integer,
      substring(report_key from 9 for 2)::integer
    )
  ) stored;

alter table public.notification_deliveries
  drop constraint notification_deliveries_locker_id_channel_report_key_key;
alter table public.notification_deliveries
  add constraint notification_deliveries_locker_channel_report_date_key
  unique (locker_id, channel, report_date);

alter table public.notification_deliveries
  drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_status_check check (status in (
    'pending', 'sending', 'delivered', 'failed', 'delivery_unknown',
    'duplicate_suppressed'
  ));

-- Atomically reserve a new report date, retry a definitively failed attempt, or
-- reclaim a reservation that crashed before SMTP started. A stale `sending`
-- attempt becomes `delivery_unknown` and is never resent automatically because
-- the provider may already have accepted the message.
create or replace function public.reserve_notification_delivery(
  p_locker_id text,
  p_channel text,
  p_report_date date,
  p_attempted_at timestamptz,
  p_retry_before timestamptz,
  p_stale_pending_before timestamptz,
  p_max_attempts integer default 3
)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  delivery public.notification_deliveries%rowtype;
begin
  if p_locker_id is null or p_channel is null or p_report_date is null
     or p_attempted_at is null
     or p_retry_before is null or p_stale_pending_before is null
     or p_max_attempts is null
     or p_channel not in ('email', 'telegram')
     or p_max_attempts not between 1 and 3 then
    raise exception using errcode = '22023', message = 'INVALID_DELIVERY_RESERVATION';
  end if;

  insert into public.notification_deliveries (
    locker_id, channel, report_key, status, attempts, attempted_at
  ) values (
    p_locker_id, p_channel, p_report_date::text, 'pending', 1, p_attempted_at
  )
  on conflict (locker_id, channel, report_date) do nothing
  returning * into delivery;

  if found then
    return next delivery;
    return;
  end if;

  select * into delivery
  from public.notification_deliveries
  where locker_id = p_locker_id
    and channel = p_channel
    and report_date = p_report_date
  for update;

  if not found then
    return;
  end if;

  if delivery.status = 'sending'
     and delivery.attempted_at <= p_stale_pending_before then
    update public.notification_deliveries
    set status = 'delivery_unknown',
        error = jsonb_build_object(
          'code', 'DELIVERY_OUTCOME_UNKNOWN',
          'message', 'Provider outcome requires manual review'
        )
    where id = delivery.id;
    return;
  end if;

  if delivery.attempts < p_max_attempts and (
    (delivery.status = 'failed' and delivery.attempted_at <= p_retry_before)
    or (delivery.status = 'pending' and delivery.attempted_at <= p_stale_pending_before)
  ) then
    update public.notification_deliveries
    set status = 'pending',
        attempts = attempts + 1,
        attempted_at = p_attempted_at,
        sent_at = null,
        error = null
    where id = delivery.id
    returning * into delivery;
    return next delivery;
  end if;

  return;
end;
$$;

revoke all privileges on function public.reserve_notification_delivery(
  text, text, date, timestamptz, timestamptz, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.reserve_notification_delivery(
  text, text, date, timestamptz, timestamptz, timestamptz, integer
) to service_role;

commit;
