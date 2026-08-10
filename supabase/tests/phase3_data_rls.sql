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

update public.lockers set owner_id = '30000000-0000-4000-8000-000000000001', claimed_at = now()
where locker_code = 'LOCKER-001';
update public.lockers set owner_id = '30000000-0000-4000-8000-000000000002', claimed_at = now()
where locker_code = 'LOCKER-002';

insert into public.device_events (
  event_id, locker_id, event_type, device, source, result, authorized, occurred_at
) values
  ('31000000-0000-4000-8000-000000000001', 'LOCKER-001', 'DOOR_OPENED', 'door', 'sensor', 'observed', true, now()),
  ('31000000-0000-4000-8000-000000000002', 'LOCKER-002', 'UNAUTHORIZED_OPEN', 'door', 'sensor', 'observed', false, now());

insert into public.notification_settings (
  locker_id, email_enabled, email_address, report_time, timezone
) values
  ('LOCKER-001', true, 'owner-a@example.test', '21:00', 'Asia/Ho_Chi_Minh'),
  ('LOCKER-002', true, 'owner-b@example.test', '21:00', 'Asia/Ho_Chi_Minh');

insert into public.notification_deliveries (
  locker_id, channel, report_key, status, attempted_at
) values
  ('LOCKER-001', 'email', '2026-08-09', 'delivered', now()),
  ('LOCKER-002', 'email', '2026-08-09', 'delivered', now());

do $$
declare
  visible_events integer;
  visible_settings integer;
  visible_deliveries integer;
  updated_rows integer;
begin
  if not has_table_privilege('authenticated', 'public.device_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.device_events', 'INSERT, UPDATE, DELETE') then
    raise exception 'device_events browser grants are not read-only';
  end if;
  if has_table_privilege('anon', 'public.device_events', 'SELECT')
     or has_table_privilege('anon', 'public.notification_settings', 'SELECT') then
    raise exception 'anonymous role received protected Phase 3 data';
  end if;

  perform set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
  set local role authenticated;

  select count(*) into visible_events from public.device_events;
  select count(*) into visible_settings from public.notification_settings;
  select count(*) into visible_deliveries from public.notification_deliveries;
  if visible_events <> 1 or visible_settings <> 1 or visible_deliveries <> 1 then
    raise exception 'User A can see cross-owner Phase 3 rows';
  end if;

  update public.notification_settings set report_time = '20:30'
  where locker_id = 'LOCKER-002';
  get diagnostics updated_rows = row_count;
  if updated_rows <> 0 then raise exception 'User A updated User B notification settings'; end if;
  reset role;

  begin
    insert into public.device_events (
      event_id, locker_id, event_type, device, source, result, authorized, occurred_at
    ) values (
      '31000000-0000-4000-8000-000000000001', 'LOCKER-001', 'DOOR_OPENED',
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
