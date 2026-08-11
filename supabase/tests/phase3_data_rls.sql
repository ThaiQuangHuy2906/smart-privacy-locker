begin;

create extension if not exists pgtap with schema extensions;
select plan(1);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase3-user-a@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'phase3-user-b@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- Use transaction-local fixtures instead of changing the real development
-- lockers. This keeps the assertions deterministic even when the project
-- already contains legitimate Phase 3 history for LOCKER-001/LOCKER-002.
insert into public.lockers (
  locker_code, display_name, owner_id, claimed_at
) values
  ('P3-RLS-A', 'Phase 3 RLS fixture A', '30000000-0000-4000-8000-000000000001', now()),
  ('P3-RLS-B', 'Phase 3 RLS fixture B', '30000000-0000-4000-8000-000000000002', now());

insert into public.device_events (
  event_id, locker_id, event_type, device, source, result, authorized, occurred_at
) values
  ('31000000-0000-4000-8000-000000000001', 'P3-RLS-A', 'DOOR_OPENED', 'door', 'sensor', 'observed', true, now()),
  ('31000000-0000-4000-8000-000000000002', 'P3-RLS-B', 'UNAUTHORIZED_OPEN', 'door', 'sensor', 'observed', false, now());

insert into public.notification_settings (
  locker_id, email_enabled, email_address, report_time, timezone
) values
  ('P3-RLS-A', true, 'owner-a@example.test', '21:00', 'Asia/Ho_Chi_Minh'),
  ('P3-RLS-B', true, 'owner-b@example.test', '21:00', 'Asia/Ho_Chi_Minh');

insert into public.notification_deliveries (
  locker_id, channel, report_key, status, attempted_at
) values
  ('P3-RLS-A', 'email', '2026-08-09', 'delivered', now()),
  ('P3-RLS-B', 'email', '2026-08-09', 'delivered', now());

do $$
declare
  telegram_retarget_rejected boolean := false;
begin
  if not has_table_privilege('authenticated', 'public.device_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.device_events', 'INSERT, UPDATE, DELETE') then
    raise exception 'device_events browser grants are not read-only';
  end if;
  if has_table_privilege('anon', 'public.device_events', 'SELECT')
     or has_table_privilege('anon', 'public.notification_settings', 'SELECT') then
    raise exception 'anonymous role received protected Phase 3 data';
  end if;
  if has_table_privilege('authenticated', 'public.notification_settings', 'SELECT')
     or not has_column_privilege('authenticated', 'public.notification_settings', 'locker_id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.notification_settings', 'telegram_linked_at', 'SELECT')
     or has_column_privilege('authenticated', 'public.notification_settings', 'telegram_chat_id', 'SELECT')
     or has_column_privilege('authenticated', 'public.notification_settings', 'telegram_user_id', 'SELECT')
     or has_table_privilege('authenticated', 'public.notification_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.notification_settings', 'UPDATE') then
    raise exception 'notification settings expose backend Telegram identifiers or allow browser writes';
  end if;
  if has_table_privilege('authenticated', 'public.telegram_link_tokens', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.telegram_link_tokens', 'SELECT, INSERT, UPDATE, DELETE')
     or not has_table_privilege('service_role', 'public.telegram_link_tokens', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'Telegram link tokens are not service-role-only';
  end if;
  if has_function_privilege(
       'authenticated',
       'public.reserve_notification_delivery(text,text,date,timestamptz,timestamptz,timestamptz,integer)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.reserve_notification_delivery(text,text,date,timestamptz,timestamptz,timestamptz,integer)',
       'EXECUTE'
     ) then
    raise exception 'delivery reservation RPC grants are not backend-only';
  end if;
  if has_function_privilege('authenticated', 'public.issue_telegram_link(text,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consume_telegram_link(text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.disconnect_telegram(text,uuid)', 'EXECUTE')
     or has_function_privilege(
       'authenticated',
       'public.update_notification_preferences(text,uuid,boolean,boolean,text,time without time zone,text)',
       'EXECUTE'
     )
     or not has_function_privilege('service_role', 'public.issue_telegram_link(text,uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.consume_telegram_link(text,text,text,text)', 'EXECUTE') then
    raise exception 'Telegram linking RPC grants are not backend-only';
  end if;

  perform set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
  set local role authenticated;

  if not exists (
       select 1 from public.device_events
       where event_id = '31000000-0000-4000-8000-000000000001'
     )
     or exists (
       select 1 from public.device_events
       where event_id = '31000000-0000-4000-8000-000000000002'
     )
     or not exists (
       select 1 from public.notification_settings
       where locker_id = 'P3-RLS-A'
     )
     or exists (
       select 1 from public.notification_settings
       where locker_id = 'P3-RLS-B'
     )
     or not exists (
       select 1 from public.notification_deliveries
       where locker_id = 'P3-RLS-A' and report_date = '2026-08-09'
     )
     or exists (
       select 1 from public.notification_deliveries
       where locker_id = 'P3-RLS-B' and report_date = '2026-08-09'
     ) then
    raise exception 'User A can see cross-owner Phase 3 rows';
  end if;

  begin
    update public.notification_settings set report_time = '20:30'
    where locker_id = 'P3-RLS-B';
    raise exception 'User A directly updated notification settings';
  exception when insufficient_privilege then null;
  end;
  reset role;

  begin
    perform public.issue_telegram_link(
      'P3-RLS-A', '30000000-0000-4000-8000-000000000002', repeat('b', 64)
    );
    raise exception 'cross-owner Telegram link token unexpectedly issued';
  exception when insufficient_privilege then null;
  end;

  perform public.issue_telegram_link(
    'P3-RLS-A', '30000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  perform public.consume_telegram_link(
    repeat('a', 64), '123456789', '123456789', 'owner_demo'
  );
  if not exists (
    select 1 from public.notification_settings
    where locker_id = 'P3-RLS-A'
      and telegram_enabled
      and telegram_chat_id = '123456789'
      and telegram_user_id = '123456789'
      and telegram_username = 'owner_demo'
      and telegram_linked_at is not null
  ) then
    raise exception 'private Telegram account was not linked to the owner locker';
  end if;

  -- Exact webhook retries are idempotent after an ambiguous network response.
  perform public.consume_telegram_link(
    repeat('a', 64), '123456789', '123456789', 'owner_demo'
  );

  begin
    perform public.consume_telegram_link(
      repeat('a', 64), '987654321', '987654321', 'other_owner'
    );
  exception when raise_exception then
    telegram_retarget_rejected := true;
  end;
  if not telegram_retarget_rejected then
    raise exception 'single-use Telegram token was reused for another private account';
  end if;

  perform public.update_notification_preferences(
    'P3-RLS-A', '30000000-0000-4000-8000-000000000001',
    true, true, 'owner-a@example.test', '20:30', 'Asia/Ho_Chi_Minh'
  );
  if not exists (
    select 1 from public.notification_settings
    where locker_id = 'P3-RLS-A'
      and telegram_enabled
      and telegram_chat_id = '123456789'
      and telegram_user_id = '123456789'
      and telegram_username = 'owner_demo'
      and telegram_linked_at is not null
      and email_enabled
      and email_address = 'owner-a@example.test'
      and report_time = '20:30'::time
      and timezone = 'Asia/Ho_Chi_Minh'
  ) then
    raise exception 'preference update lost the linked Telegram destination';
  end if;
  perform public.disconnect_telegram(
    'P3-RLS-A', '30000000-0000-4000-8000-000000000001'
  );
  if exists (
    select 1 from public.notification_settings
    where locker_id = 'P3-RLS-A'
      and (telegram_enabled or telegram_chat_id is not null
           or telegram_user_id is not null or telegram_linked_at is not null)
  ) then
    raise exception 'Telegram disconnect left a routable destination';
  end if;
  if exists (
    select 1 from public.telegram_link_tokens where locker_id = 'P3-RLS-A'
  ) then
    raise exception 'Telegram disconnect left a reusable link token';
  end if;

  begin
    update public.notification_settings
    set timezone = 'Not/A_Real_Timezone'
    where locker_id = 'P3-RLS-A';
    raise exception 'invalid timezone unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.reserve_notification_delivery(
      'P3-RLS-A', null, '2026-08-09', now(), now(), now(), null
    );
    raise exception 'invalid reservation arguments unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    insert into public.notification_deliveries (
      locker_id, channel, report_key, status, attempted_at
    ) values (
      'P3-RLS-A', 'email', '2026-08-09:Asia/Saigon', 'pending', now()
    );
    raise exception 'equivalent timezone report date unexpectedly duplicated';
  exception when unique_violation then null;
  end;

  begin
    insert into public.device_events (
      event_id, locker_id, event_type, device, source, result, authorized, occurred_at
    ) values (
      '31000000-0000-4000-8000-000000000001', 'P3-RLS-A', 'DOOR_OPENED',
      'door', 'sensor', 'observed', true, now()
    );
    raise exception 'duplicate event_id unexpectedly succeeded';
  exception when unique_violation then null;
  end;
end;
$$;

select pass('Phase 3 event, settings, delivery, idempotency, grant, and RLS contract');
select * from finish();

rollback;
