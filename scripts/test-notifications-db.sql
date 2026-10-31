-- Disposable PostgreSQL regression; requires inbound integrations, incoming webhook and notification migrations.
-- Run only against an isolated test database. All synthetic fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
INSERT INTO public.inbound_integrations(id,user_id,provider,display_name,credential_reference) VALUES
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','telegram','Synthetic bot','credential://telegram/00000000-0000-0000-0000-000000000009');
INSERT INTO public.notification_channels(id,user_id,kind,name,destination,integration_id) VALUES
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','telegram','Alerts','12345','00000000-0000-0000-0000-000000000003');
INSERT INTO public.notification_channels(id,user_id,kind,name,destination,credential_reference,enabled) VALUES
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','webhook','Paused','https://example.com/hook','credential://notification/00000000-0000-0000-0000-000000000009',false),
 ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','webhook','Other owner','https://example.com/hook','credential://notification/00000000-0000-0000-0000-000000000009',true);
INSERT INTO public.incoming_webhooks(id,user_id,name,secret_hash) VALUES
 ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','Warehouse',repeat('a',64));
INSERT INTO public.incoming_webhook_deliveries(id,webhook_id,user_id,delivery_id,payload) VALUES
 ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','fixture-event','{"sensitive":"never included in notification"}');
DO $$
DECLARE item uuid; changed integer;
BEGIN
 IF (SELECT count(*) FROM public.notifications) <> 1 THEN RAISE EXCEPTION 'Expected one inbox item'; END IF;
 IF (SELECT count(*) FROM public.notification_deliveries) <> 1 THEN RAISE EXCEPTION 'Paused or other-owner channel enqueued'; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE body LIKE '%sensitive%') THEN RAISE EXCEPTION 'Payload leaked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.notifications WHERE read_at IS NULL AND body LIKE 'Warehouse%fixture-event%') THEN RAISE EXCEPTION 'Inbox summary missing'; END IF;
 BEGIN
  INSERT INTO public.incoming_webhook_deliveries(webhook_id,user_id,delivery_id,payload) VALUES
   ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','fixture-event','{}');
  RAISE EXCEPTION 'Duplicate accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF (SELECT count(*) FROM public.notifications) <> 1 THEN RAISE EXCEPTION 'Duplicate notification'; END IF;
 BEGIN
  INSERT INTO public.notification_channels(user_id,kind,name,destination,integration_id) VALUES
   ('00000000-0000-0000-0000-000000000002','telegram','Wrong owner','12345','00000000-0000-0000-0000-000000000003');
  RAISE EXCEPTION 'Cross-owner bot accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Bot must belong to the notification owner' THEN RAISE; END IF; END;
 SELECT id INTO item FROM public.notifications;
 BEGIN
  INSERT INTO public.notification_deliveries(user_id,notification_id,channel_id) VALUES
   ('00000000-0000-0000-0000-000000000002',item,'00000000-0000-0000-0000-000000000006');
  RAISE EXCEPTION 'Cross-owner delivery accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 UPDATE public.notifications SET read_at=now() WHERE id=item AND user_id='00000000-0000-0000-0000-000000000002';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Wrong owner read update'; END IF;
 UPDATE public.notification_deliveries SET status='sending' WHERE status='pending' AND user_id='00000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'First claim failed'; END IF;
 UPDATE public.notification_deliveries SET status='sending' WHERE status='pending';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Claim repeated'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relname IN ('notifications','notification_channels','notification_deliveries') AND NOT relrowsecurity) THEN RAISE EXCEPTION 'RLS missing'; END IF;
 IF has_table_privilege('authenticated','public.notifications','select') OR has_table_privilege('anon','public.notification_channels','select') OR has_table_privilege('authenticated','public.notification_deliveries','update') THEN RAISE EXCEPTION 'Direct client access'; END IF;
 IF NOT has_table_privilege('service_role','public.notification_deliveries','insert') THEN RAISE EXCEPTION 'Service access missing'; END IF;
END $$;
-- Ten destinations is a database-enforced bound, not only a UI check.
INSERT INTO public.notification_channels(user_id,kind,name,destination,credential_reference)
 SELECT '00000000-0000-0000-0000-000000000001','webhook','Bound fixture','https://example.com/hook','credential://notification/00000000-0000-0000-0000-000000000009' FROM generate_series(1,8);
DO $$ BEGIN
 BEGIN
  INSERT INTO public.notification_channels(user_id,kind,name,destination,credential_reference) VALUES
   ('00000000-0000-0000-0000-000000000001','webhook','Too many','https://example.com/hook','credential://notification/00000000-0000-0000-0000-000000000009');
  RAISE EXCEPTION 'Unbounded channel count';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Maximum 10 notification destinations per account' THEN RAISE; END IF; END;
END $$;
DELETE FROM public.incoming_webhooks WHERE id='00000000-0000-0000-0000-000000000007';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.notifications) OR EXISTS(SELECT 1 FROM public.notification_deliveries) THEN RAISE EXCEPTION 'Webhook cascade failed'; END IF;
END $$;
DELETE FROM public.inbound_integrations WHERE id='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.notification_channels WHERE kind='telegram') THEN RAISE EXCEPTION 'Bot removal cascade failed'; END IF;
END $$;
ROLLBACK;
