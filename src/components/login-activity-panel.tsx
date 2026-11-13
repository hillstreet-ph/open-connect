import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Bot, Clock, Loader2, LogOut, MapPin, Monitor, Smartphone, Tablet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatRelative } from "@/lib/date-time";
import { describeDevice, parseUserAgent, type DeviceKind } from "@/lib/login-activity";
import {
  listLoginActivity,
  revokeLoginSession,
  revokeOtherLoginSessions,
} from "@/lib/login-activity.functions";

const DEVICE_ICONS: Record<DeviceKind, React.ComponentType<{ className?: string }>> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot,
  unknown: Monitor,
};

function DeviceIcon({ kind }: { kind: DeviceKind }) {
  const Icon = DEVICE_ICONS[kind];
  return (
    <span className="rounded-lg bg-primary/10 p-2 text-primary">
      <Icon className="size-4" />
    </span>
  );
}

export function LoginActivityPanel() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  return <AccountLoginActivity key={user.id} userId={user.id} />;
}

function AccountLoginActivity({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listLoginActivity);
  const revokeFn = useServerFn(revokeLoginSession);
  const revokeOthersFn = useServerFn(revokeOtherLoginSessions);

  const query = useQuery({
    queryKey: ["login-activity", userId],
    queryFn: () => listFn(),
    refetchInterval: 60000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["login-activity", userId] });

  const revoke = useMutation({
    mutationFn: (sessionId: string) => revokeFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Session signed out");
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not sign out that session"),
  });

  const revokeOthers = useMutation({
    mutationFn: () => revokeOthersFn(),
    onSuccess: ({ revoked }) => {
      toast.success(
        revoked > 0
          ? `Signed out ${revoked} other ${revoked === 1 ? "session" : "sessions"}`
          : "No other sessions to sign out",
      );
      void refresh();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not sign out other sessions"),
  });

  const sessions = query.data ?? [];
  const others = sessions.filter((session) => !session.is_current);

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Login activity</CardTitle>
            <CardDescription>
              Devices and locations where your account is signed in. Sign out any session you do not
              recognize.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={others.length === 0 || revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            {revokeOthers.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 size-4" />
            )}
            Sign out other sessions
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : query.isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load your login activity. Please refresh the page.
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {sessions.map((session) => {
              const parsed = parseUserAgent(session.user_agent);
              return (
                <li
                  key={session.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <DeviceIcon kind={parsed.kind} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {describeDevice(parsed)}
                        </span>
                        {session.is_current ? (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            This device
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{session.location}</span>
                        {session.ip ? <span className="truncate">· {session.ip}</span> : null}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5 shrink-0" />
                        <span>
                          Active {formatRelative(session.last_active_at)} · Signed in{" "}
                          {formatDateTime(session.created_at)}
                        </span>
                      </p>
                    </div>
                  </div>
                  {session.is_current ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={revoke.isPending && revoke.variables === session.id}
                      onClick={() => revoke.mutate(session.id)}
                    >
                      {revoke.isPending && revoke.variables === session.id ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <LogOut className="mr-2 size-4" />
                      )}
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
