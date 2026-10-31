import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, MessageCircle, Webhook } from "lucide-react";
import { toast } from "sonner";
import { listInboundIntegrations } from "@/lib/inbound-integrations.functions";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  retryNotificationDelivery,
  setNotificationChannelEnabled,
  testNotificationChannel,
} from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function NotificationChannels({ userId }: { userId: string }) {
  const [kind, setKind] = useState<"telegram" | "webhook">("telegram");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [topic, setTopic] = useState("");
  const [bot, setBot] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const list = useServerFn(listNotificationChannels);
  const botsFn = useServerFn(listInboundIntegrations);
  const create = useServerFn(createNotificationChannel);
  const remove = useServerFn(deleteNotificationChannel);
  const toggle = useServerFn(setNotificationChannelEnabled);
  const test = useServerFn(testNotificationChannel);
  const retry = useServerFn(retryNotificationDelivery);
  const queryKey = ["notification-channels", userId];
  const channels = useQuery({ queryKey, queryFn: () => list({}), refetchInterval: 30_000 });
  const bots = useQuery({ queryKey: ["inbound-integrations", userId], queryFn: () => botsFn({}) });
  const telegramBots = (bots.data ?? []).filter((item) => item.provider === "telegram");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["notification-inbox", userId] });
  };
  const add = useMutation({
    mutationFn: () =>
      create({
        data: {
          kind,
          name,
          destination,
          topic,
          ...(kind === "telegram" ? { integration_id: bot } : {}),
        },
      }),
    onSuccess: (result) => {
      setSecret(result.secret);
      setName("");
      setDestination("");
      setTopic("");
      refresh();
      toast.success("Notification destination added");
    },
    onError: (error) => toast.error(error.message),
  });
  const action = useMutation({
    mutationFn: async (input: {
      id: string;
      type: "delete" | "test" | "toggle" | "retry";
      enabled?: boolean;
    }) => {
      if (input.type === "delete") return remove({ data: { id: input.id } });
      if (input.type === "test") return test({ data: { id: input.id } });
      if (input.type === "retry") return retry({ data: { id: input.id } });
      return toggle({ data: { id: input.id, enabled: !!input.enabled } });
    },
    onSuccess: (_, input) => {
      refresh();
      toast.success(
        input.type === "test" || input.type === "retry"
          ? "Delivery attempted. Check its result below."
          : "Destination updated",
      );
    },
    onError: (error) => {
      refresh();
      toast.error(error.message);
    },
  });
  return (
    <Card id="notification-destinations" className="shadow-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4" />
          Notifications and alerts
        </CardTitle>
        <CardDescription>
          Receive webhook activity in your internal inbox and send alerts to Telegram or an outbound
          webhook URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Every new incoming webhook delivery creates an inbox notification. Enabled destinations
          receive a summary with the webhook name and delivery ID. Raw incoming payloads are kept in
          Open-Connect. These notification apps do not grant agent connector access.
        </p>
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <h3 className="font-medium">Add notification destination</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "telegram" ? "default" : "outline"}
              onClick={() => {
                setKind("telegram");
                setDestination("");
              }}
            >
              <MessageCircle className="mr-2 size-4" />
              Telegram bot
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "webhook" ? "default" : "outline"}
              onClick={() => {
                setKind("webhook");
                setDestination("");
              }}
            >
              <Webhook className="mr-2 size-4" />
              Outbound webhook
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notification-name">Destination name</Label>
            <Input
              id="notification-name"
              value={name}
              maxLength={80}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="Warehouse alerts"
            />
          </div>
          {kind === "telegram" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="notification-bot">Connected bot</Label>
                <select
                  id="notification-bot"
                  value={bot}
                  onChange={(e) => setBot(e.target.value)}
                  required
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Choose a Telegram bot</option>
                  {telegramBots.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name}
                    </option>
                  ))}
                </select>
              </div>
              {bots.isError ? (
                <p role="alert" className="text-sm">
                  Could not load bots.{" "}
                  <Button type="button" variant="link" onClick={() => void bots.refetch()}>
                    Retry
                  </Button>
                </p>
              ) : null}
              {!bots.isLoading && !bots.isError && !telegramBots.length ? (
                <p className="text-sm text-muted-foreground">
                  First{" "}
                  <Link
                    to="/integrations"
                    search={{ section: "apps" }}
                    className="text-primary underline"
                  >
                    set up a Telegram bot in Apps
                  </Link>
                  .
                </p>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="notification-destination">Chat ID</Label>
                <Input
                  id="notification-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                  placeholder="-1001234567890"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notification-topic">Topic ID (optional)</Label>
                <Input
                  id="notification-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Leave blank for a normal chat"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Start the bot in your private chat, or add it to your group and allow it to send
                messages. Enter the numeric chat ID from your Telegram setup. A topic ID sends only
                to that topic; failures never fall back to another chat.
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="notification-destination">Webhook URL</Label>
                <Input
                  id="notification-destination"
                  type="url"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                  placeholder="https://your-app.example/webhooks/open-connect"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Public HTTPS on port 443, without URL credentials or query parameters. Redirects are
                not followed. Save the signing secret shown once after creation.
              </p>
            </>
          )}
          <Button
            type="submit"
            disabled={
              add.isPending || !name.trim() || !destination.trim() || (kind === "telegram" && !bot)
            }
          >
            {add.isPending ? "Saving…" : "Add destination"}
          </Button>
        </form>
        {secret ? (
          <div role="status" className="space-y-2 rounded border p-3 text-sm">
            <p>Save this signing secret now. It will not be shown again.</p>
            <code className="block break-all">{secret}</code>
            <Button size="sm" variant="outline" onClick={() => setSecret(null)}>
              I saved the secret
            </Button>
          </div>
        ) : null}
        <details className="rounded border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Outbound webhook contract</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>
              Events: <code>webhook.received</code> and <code>notification.test</code>. JSON:{" "}
              <code>
                {
                  '{"id":"event UUID","type":"webhook.received","created_at":"ISO timestamp","data":{"title":"Webhook received","message":"Webhook name · Delivery ID"}}'
                }
              </code>
            </p>
            <p>
              Verify <code>x-open-connect-signature</code> as <code>sha256=</code> plus the hex
              HMAC-SHA256 of <code>timestamp + "." + raw request body</code>, using the signing
              secret. Read timestamp from <code>x-open-connect-timestamp</code>, compare signatures
              in constant time, and reject timestamps older than five minutes. Deduplicate by{" "}
              <code>x-open-connect-event-id</code> (same as JSON id).
            </p>
            <p>
              Return HTTP 2xx to acknowledge. Delivery runs once immediately; failures and
              interrupted attempts remain available for manual retry below. Retry keeps the same
              event ID and signs with a fresh timestamp. Network failures can have an unknown
              outcome, so receivers must deduplicate.
            </p>
          </div>
        </details>
        {channels.isLoading ? <p className="text-sm">Loading destinations…</p> : null}
        {channels.isError ? (
          <p role="alert">
            Could not load destinations.{" "}
            <Button variant="link" onClick={() => void channels.refetch()}>
              Retry
            </Button>
          </p>
        ) : null}
        {channels.data?.channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No external destinations yet. Your internal notification inbox is active.
          </p>
        ) : null}
        {channels.data?.channels.map((item) => (
          <div key={item.id} className="space-y-2 rounded border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{item.name}</strong>
              <Badge variant="secondary">{item.kind}</Badge>
              <Badge variant="outline">{item.enabled ? "Enabled" : "Paused"}</Badge>
            </div>
            <p className="break-all text-muted-foreground">
              {item.destination}
              {item.topic_id ? ` · Topic ${item.topic_id}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending || !item.enabled}
                onClick={() => action.mutate({ id: item.id, type: "test" })}
              >
                Send test alert
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ id: item.id, type: "toggle", enabled: !item.enabled })
                }
              >
                {item.enabled ? "Pause" : "Enable"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending}
                onClick={() => {
                  if (window.confirm(`Remove ${item.name} and its delivery history?`))
                    action.mutate({ id: item.id, type: "delete" });
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Outbound delivery monitoring</h3>
            <Button size="sm" variant="ghost" onClick={refresh}>
              Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Latest 50 attempts. Sent means the destination acknowledged receipt.
          </p>
          {channels.data?.deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No outbound deliveries yet. Add a destination and send a test alert.
            </p>
          ) : null}
          {channels.data?.deliveries.map((item) => (
            <div key={item.id} className="space-y-1 rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{item.notification_channels?.name ?? "Destination"}</strong>
                <Badge variant={item.status === "failed" ? "destructive" : "secondary"}>
                  {item.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(item.created_at).toLocaleString()} · {item.attempts} completed attempt(s)
                {item.status_code ? ` · HTTP ${item.status_code}` : ""}
              </p>
              {item.error_message ? (
                <p className="text-sm text-muted-foreground">{item.error_message}</p>
              ) : null}
              {item.status === "failed" ||
              item.status === "pending" ||
              (item.status === "sending" &&
                item.attempted_at &&
                channels.dataUpdatedAt - Date.parse(item.attempted_at) > 120_000) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Retry this alert? A previous attempt may have reached the destination. Ensure your receiver deduplicates event IDs.",
                      )
                    )
                      action.mutate({ id: item.id, type: "retry" });
                  }}
                >
                  Retry delivery
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
