import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { connectApp, disconnectApp, listAppConnections, listConnectionCatalog } from "@/lib/connections.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/connections")({
  head: () => ({
    meta: [
      { title: "Connect Apps — Open-Connect" },
      {
        name: "description",
        content: "Connect GitHub, Slack, Notion and more. Agents get capability, never raw credentials.",
      },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const catalogFn = useServerFn(listConnectionCatalog);
  const listFn = useServerFn(listAppConnections);
  const connectFn = useServerFn(connectApp);
  const disconnectFn = useServerFn(disconnectApp);

  const catalog = useQuery({ queryKey: ["connection-catalog"], queryFn: () => catalogFn({}) });
  const mine = useQuery({
    queryKey: ["app-connections"],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
  });

  const connectMutation = useMutation({
    mutationFn: (provider: string) => connectFn({ data: { provider } }),
    onSuccess: () => {
      toast.success("Connected");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connect failed"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Disconnected");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
  });

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (catalog.data ?? []).filter(
      (app) => !term || app.display_name.toLowerCase().includes(term) || app.provider.includes(term),
    );
  }, [catalog.data, query]);

  const connectedProviders = new Set((mine.data ?? []).map((c) => c.provider));

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl font-semibold sm:text-4xl">Connect Apps</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        One connect action per application. Open-Connect holds the capability reference; agents never see
        provider secrets.
      </p>

      <div className="relative mt-8 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search applications…"
          className="pl-9"
        />
      </div>

      {user && (mine.data?.length ?? 0) > 0 ? (
        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Your connections</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.data?.map((c) => (
              <Card key={c.id} className="flex flex-row items-center justify-between p-4">
                <div>
                  <p className="font-medium">{c.display_name}</p>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {c.status}
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => disconnectMutation.mutate(c.id)}>
                  Disconnect
                </Button>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((app) => {
          const connected = connectedProviders.has(app.provider);
          return (
            <Card key={app.provider} className="flex flex-row items-center justify-between p-5">
              <div>
                <p className="font-display text-base font-semibold">{app.display_name}</p>
                <p className="text-xs text-muted-foreground">{app.category}</p>
              </div>
              {!user ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/auth">Sign in</Link>
                </Button>
              ) : connected ? (
                <Badge variant="secondary">Connected</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={connectMutation.isPending}
                  onClick={() => connectMutation.mutate(app.provider)}
                >
                  Connect
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-14 bg-pillar shadow-panel">
        <CardHeader>
          <Badge variant="outline" className="w-fit border-primary/40 text-primary">
            <Lock className="mr-1 size-3" /> Credential boundary
          </Badge>
          <CardTitle className="mt-3">Agents never see the secret</CardTitle>
          <CardDescription>
            Provider tokens stay server-side. An agent presents an Open-Connect scoped key; the gateway
            validates permission and calls the provider on its behalf.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
