import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createIncomingWebhook,
  deleteIncomingWebhook,
  listIncomingDeliveries,
  listIncomingWebhooks,
} from "@/lib/incoming-webhooks.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function IncomingWebhooks({ userId }: { userId: string | undefined }) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const queryClient = useQueryClient();
  const list = useServerFn(listIncomingWebhooks);
  const create = useServerFn(createIncomingWebhook);
  const remove = useServerFn(deleteIncomingWebhook);
  const deliveries = useServerFn(listIncomingDeliveries);
  const rows = useQuery({
    queryKey: ["incoming-webhooks", userId],
    queryFn: () => list({}),
    enabled: !!userId,
  });
  const events = useQuery({
    queryKey: ["incoming-deliveries", userId, selected],
    queryFn: () => deliveries({ data: { id: selected! } }),
    enabled: !!userId && !!selected,
  });
  const add = useMutation({
    mutationFn: () => create({ data: { name } }),
    onSuccess: (result) => {
      setCreated(result);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["incoming-webhooks"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (_, id) => {
      if (selected === id) setSelected(null);
      if (created?.id === id) setCreated(null);
      void queryClient.invalidateQueries({ queryKey: ["incoming-webhooks"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const endpoint = (id: string) =>
    `${typeof window === "undefined" ? "" : window.location.origin}/api/webhooks/${id}`;
  return (
    <Card id="incoming-webhooks" className="shadow-panel">
      <CardHeader>
        <CardTitle className="text-base">Incoming webhooks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Receive JSON from senders that can set custom headers. Deliveries are saved in your
          private inbox and the notification bell. Enabled notification destinations receive receipt
          summaries. Deliveries do not start automations. Provider-specific signatures and
          verification challenges are not supported.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor="webhook-name">Webhook name</Label>
            <Input
              id="webhook-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
            Add webhook
          </Button>
        </div>
        {created ? (
          <div role="status" className="space-y-2 rounded border p-3 text-sm">
            <p>Save this secret now. It will not be shown again.</p>
            <p className="break-all">
              URL: <code>{endpoint(created.id)}</code>
            </p>
            <p className="break-all">
              Secret: <code>{created.secret}</code>
            </p>
            <Button variant="outline" size="sm" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          POST application/json with headers <code>x-open-connect-secret</code> and a unique{" "}
          <code>x-open-connect-delivery-id</code>. Reuse the same delivery ID for retries. Maximum
          body: 64 KiB. Deleting a webhook also deletes its deliveries.
        </p>
        {rows.isError ? (
          <p role="alert">
            Could not load webhooks.{" "}
            <Button variant="link" onClick={() => void rows.refetch()}>
              Retry
            </Button>
          </p>
        ) : null}
        {rows.data?.map((hook) => (
          <div key={hook.id} className="space-y-2 rounded border p-3 text-sm">
            <strong>{hook.name}</strong>
            <p className="break-all">{endpoint(hook.id)}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(selected === hook.id ? null : hook.id)}
              >
                {selected === hook.id ? "Hide deliveries" : "View deliveries"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={del.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${hook.name} and all its deliveries?`))
                    del.mutate(hook.id);
                }}
              >
                Delete
              </Button>
            </div>
            {selected === hook.id ? (
              <div className="space-y-2">
                {events.isError ? <p role="alert">Could not load deliveries.</p> : null}
                {events.isLoading ? <p>Loading deliveries…</p> : null}
                {events.data?.length === 0 ? <p>No deliveries yet.</p> : null}
                {events.data?.map((event) => (
                  <details key={event.id}>
                    <summary className="cursor-pointer break-all">
                      {new Date(event.received_at).toLocaleString()} · {event.delivery_id}
                    </summary>
                    <pre className="overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </details>
                ))}
                <Button size="sm" variant="outline" onClick={() => void events.refetch()}>
                  Refresh deliveries
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
