import { Bell, Check, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { listNotifications, markNotificationsRead } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function NotificationInbox() {
  const { user } = useAuth();
  const list = useServerFn(listNotifications);
  const mark = useServerFn(markNotificationsRead);
  const queryClient = useQueryClient();
  const queryKey = ["notification-inbox", user?.id];
  const inbox = useQuery({
    queryKey,
    queryFn: () => list({}),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: (data: { id?: string; through?: string }) => mark({ data }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast.error(error.message),
  });
  const unread = inbox.data?.unread ?? 0;
  if (!user) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span
              className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground"
              aria-hidden="true"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        aria-label="Notification inbox"
      >
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">Notifications</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={read.isPending || !unread || !inbox.data?.items.length}
            onClick={() => read.mutate({ through: inbox.data!.items[0]!.created_at })}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto p-2" aria-live="polite">
          {inbox.isLoading ? (
            <p className="flex items-center gap-2 p-3 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </p>
          ) : null}
          {inbox.isError ? (
            <div role="alert" className="p-3 text-sm">
              Could not load notifications.{" "}
              <Button variant="link" onClick={() => void inbox.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}
          {inbox.data?.items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No notifications yet. Webhook receipts and test alerts will appear here.
            </p>
          ) : null}
          {inbox.data?.items.map((item) => (
            <article
              key={item.id}
              className={`mb-1 rounded-md p-3 ${item.read_at ? "" : "bg-accent/60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {item.title}
                  {!item.read_at ? <span className="sr-only"> (unread)</span> : null}
                </h3>
                {!item.read_at ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 shrink-0"
                    aria-label={`Mark ${item.title} read`}
                    disabled={read.isPending}
                    onClick={() => read.mutate({ id: item.id })}
                  >
                    <Check className="size-3" />
                  </Button>
                ) : null}
              </div>
              <p className="break-words text-sm text-muted-foreground">{item.body}</p>
              <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.created_at}>
                {new Date(item.created_at).toLocaleString()}
              </time>
            </article>
          ))}
        </div>
        <div className="flex items-center justify-between border-t p-3 text-xs">
          <span className="text-muted-foreground">Latest 50 · refreshes every 30s</span>
          <Link to="/settings" hash="integrations" className="text-primary hover:underline">
            Notification settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
