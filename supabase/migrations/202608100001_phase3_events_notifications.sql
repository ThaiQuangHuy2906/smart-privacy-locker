begin;

create table public.device_events (
  event_id uuid primary key,
  schema_version integer not null default 1 check (schema_version = 1),
  locker_id text not null references public.lockers(locker_code) on update cascade on delete cascade,
  event_type text not null check (event_type in (
    'DOOR_OPENED', 'DOOR_CLOSED', 'DOOR_UNKNOWN', 'LOCK_COMMAND', 'UNLOCK_COMMAND',
    'LOCK_STATE_CHANGED', 'ALARM_STARTED', 'ALARM_STOPPED', 'LED_TURNED_ON',
    'LED_TURNED_OFF', 'DEVICE_ONLINE', 'DEVICE_OFFLINE', 'UNAUTHORIZED_OPEN',
    'COMMAND_REJECTED', 'COMMAND_TIMEOUT', 'TELEGRAM_NOTIFICATION', 'DAILY_EMAIL_REPORT'
  )),
  device text not null check (device in ('door', 'lock', 'alarm', 'led', 'system', 'notification')),
  action text null,
  source text not null check (source in ('sensor', 'dashboard', 'system', 'automation')),
  result text not null check (result in ('observed', 'success', 'failure', 'rejected', 'timeout')),
  authorized boolean null,
  command_id uuid null,
  device_state jsonb null,
  error jsonb null,
  principal jsonb null,
  notification_status text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint device_events_authorization check (
    (event_type in ('DOOR_OPENED', 'UNAUTHORIZED_OPEN') and authorized is not null)
    or (event_type not in ('DOOR_OPENED', 'UNAUTHORIZED_OPEN') and authorized is null)
  )
);

create index device_events_locker_occurred_idx
  on public.device_events(locker_id, occurred_at desc);
create index device_events_locker_type_occurred_idx
  on public.device_events(locker_id, event_type, occurred_at desc);

create table public.notification_settings (
  locker_id text primary key references public.lockers(locker_code) on update cascade on delete cascade,
  telegram_enabled boolean not null default false,
  telegram_chat_id text null check (telegram_chat_id is null or char_length(telegram_chat_id) between 1 and 128),
  email_enabled boolean not null default false,
  email_address text null check (email_address is null or char_length(email_address) between 3 and 254),
  report_time time not null default '21:00',
  timezone text not null default 'Asia/Ho_Chi_Minh' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_settings_email check (not email_enabled or email_address is not null),
  constraint notification_settings_telegram check (not telegram_enabled or telegram_chat_id is not null)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  locker_id text not null references public.lockers(locker_code) on update cascade on delete cascade,
  channel text not null check (channel in ('email', 'telegram')),
  report_key text not null check (char_length(report_key) between 1 and 160),
  status text not null check (status in ('pending', 'delivered', 'failed', 'duplicate_suppressed')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  attempted_at timestamptz not null,
  sent_at timestamptz null,
  error jsonb null,
  created_at timestamptz not null default now(),
  unique (locker_id, channel, report_key)
);

create index notification_deliveries_locker_attempted_idx
  on public.notification_deliveries(locker_id, attempted_at desc);

alter table public.device_events enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_deliveries enable row level security;

create policy device_events_select_owned on public.device_events
  for select to authenticated using (exists (
    select 1 from public.lockers
    where lockers.locker_code = device_events.locker_id
      and lockers.owner_id = auth.uid()
  ));

create policy notification_settings_select_owned on public.notification_settings
  for select to authenticated using (exists (
    select 1 from public.lockers
    where lockers.locker_code = notification_settings.locker_id
      and lockers.owner_id = auth.uid()
  ));
create policy notification_settings_insert_owned on public.notification_settings
  for insert to authenticated with check (exists (
    select 1 from public.lockers
    where lockers.locker_code = notification_settings.locker_id
      and lockers.owner_id = auth.uid()
  ));
create policy notification_settings_update_owned on public.notification_settings
  for update to authenticated using (exists (
    select 1 from public.lockers
    where lockers.locker_code = notification_settings.locker_id
      and lockers.owner_id = auth.uid()
  )) with check (exists (
    select 1 from public.lockers
    where lockers.locker_code = notification_settings.locker_id
      and lockers.owner_id = auth.uid()
  ));

create policy notification_deliveries_select_owned on public.notification_deliveries
  for select to authenticated using (exists (
    select 1 from public.lockers
    where lockers.locker_code = notification_deliveries.locker_id
      and lockers.owner_id = auth.uid()
  ));

revoke all privileges on table public.device_events, public.notification_settings,
  public.notification_deliveries from public, anon, authenticated;
grant select on table public.device_events to authenticated;
grant select, insert, update on table public.notification_settings to authenticated;
grant select on table public.notification_deliveries to authenticated;

grant all privileges on table public.device_events, public.notification_settings,
  public.notification_deliveries to service_role;

commit;
