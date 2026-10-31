-- Notification Apps are account-owned and independent of executable Connectors.
CREATE TABLE public.notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('telegram', 'webhook')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  destination text NOT NULL CHECK (length(destination) BETWEEN 1 AND 2048),
  topic_id bigint CHECK (topic_id > 0),
  integration_id uuid REFERENCES public.inbound_integrations(id) ON DELETE CASCADE,
  credential_reference text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK ((kind = 'telegram' AND integration_id IS NOT NULL AND credential_reference IS NULL)
    OR (kind = 'webhook' AND integration_id IS NULL AND topic_id IS NULL AND credential_reference IS NOT NULL))
);
CREATE INDEX notification_channels_owner ON public.notification_channels(user_id);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_delivery_id uuid UNIQUE REFERENCES public.incoming_webhook_deliveries(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('webhook.received', 'notification.test')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(body) <= 500),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX notifications_owner_time ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  attempted_at timestamptz,
  status_code integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (notification_id, user_id) REFERENCES public.notifications(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id, user_id) REFERENCES public.notification_channels(id, user_id) ON DELETE CASCADE,
  UNIQUE (notification_id, channel_id)
);
CREATE INDEX notification_deliveries_owner_time ON public.notification_deliveries(user_id, created_at DESC);

ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_channels, public.notifications, public.notification_deliveries FROM public, anon, authenticated;
GRANT ALL ON public.notification_channels, public.notifications, public.notification_deliveries TO service_role;

CREATE FUNCTION public.enqueue_webhook_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE notification_id uuid;
BEGIN
  INSERT INTO public.notifications(user_id, source_delivery_id, event_type, title, body)
  SELECT NEW.user_id, NEW.id, 'webhook.received', 'Webhook received',
    left(hook.name, 120) || ' · Delivery ' || left(NEW.delivery_id, 200)
  FROM public.incoming_webhooks hook WHERE hook.id = NEW.webhook_id AND hook.user_id = NEW.user_id
  RETURNING id INTO notification_id;
  INSERT INTO public.notification_deliveries(user_id, notification_id, channel_id)
  SELECT NEW.user_id, notification_id, channel.id FROM public.notification_channels channel
  WHERE channel.user_id = NEW.user_id AND channel.enabled;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_webhook_notification() FROM public, anon, authenticated;
CREATE TRIGGER enqueue_webhook_notification AFTER INSERT ON public.incoming_webhook_deliveries
FOR EACH ROW EXECUTE FUNCTION public.enqueue_webhook_notification();

-- Bound per-account fanout and reject cross-owner bot references, even for service writes.
CREATE FUNCTION public.validate_notification_channel() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 823));
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM public.notification_channels WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 notification destinations per account';
  END IF;
  IF NEW.kind = 'telegram' AND NOT EXISTS (
    SELECT 1 FROM public.inbound_integrations WHERE id = NEW.integration_id AND user_id = NEW.user_id AND provider = 'telegram'
  ) THEN RAISE EXCEPTION 'Bot must belong to the notification owner'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_notification_channel() FROM public, anon, authenticated;
CREATE TRIGGER validate_notification_channel BEFORE INSERT OR UPDATE ON public.notification_channels
FOR EACH ROW EXECUTE FUNCTION public.validate_notification_channel();
