import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { connectApp, disconnectApp, listAppConnections, listConnectionCatalog } from "@/lib/connections.functions";
import { useAuth } from "@/hooks/use-auth";
import { connectionCategories } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Open-Connect" },
      {
        name: "description",
        content: "Connect GitHub, Telegram, ChatGPT, Grok and more. Agents get capability, never raw credentials.",
      },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
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
    return (catalog.data ?? []).filter((app) => {
      const matchesCat = category === "All" || app.category === category;
      const matchesTerm =
        !term ||
        app.display_name.toLowerCase().includes(term) ||
        app.provider.includes(term) ||
        app.category.toLowerCase().includes(term);
      return matchesCat && matchesTerm;
    });
  }, [catalog.data, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    for (const app of results) {
      const list = map.get(app.category) ?? [];
      list.push(app);
      map.set(app.category, list);
    }
    const order = ["All", ...connectionCategories];
    return order
      .filter((c) => c !== "All" && map.has(c))
      .map((c) => ({ category: c, apps: map.get(c)! }));
  }, [results]);

  const connectedProviders = new Set((mine.data ?? []).map((c) => c.provider));
  const catOptions = ["All", ...connectionCategories];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        Catalog · Connections
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-4xl">Connect apps</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        One connect per app. Open-Connect holds the capability; agents never see provider secrets.
      </p>

      <div className="mt-8 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps…"
            className="pl-9"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {catOptions.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={
                category === c
                  ? "shrink-0 rounded-full border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs text-primary"
                  : "shrink-0 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground"
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {user && (mine.data?.length ?? 0) > 0 ? (
        <div className="mt-8 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your connections
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
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

      <div className="mt-10 space-y-8">
        {grouped.map((group) => (
          <div key={group.category}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.category}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.apps.map((app) => {
                const connected = connectedProviders.has(app.provider);
                return (
                  <Card key={app.provider} className="flex flex-row items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{app.display_name}</p>
                      <p className="text-xs text-muted-foreground">{app.category}</p>
                    </div>
                    {!user ? (
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link to="/auth">Sign in</Link>
                      </Button>
                    ) : connected ? (
                      <Badge variant="secondary" className="shrink-0">
                        Connected
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
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
          </div>
        ))}
        {grouped.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No apps match this filter.</p>
        ) : null}
      </div>

      <Card className="mt-12 bg-pillar shadow-panel">
        <CardHeader className="p-5">
          <Badge variant="outline" className="w-fit border-primary/40 text-primary">
            <Lock className="mr-1 size-3" /> Credential boundary
          </Badge>
          <CardTitle className="mt-3 text-base">Agents never see the secret</CardTitle>
          <CardDescription>
            Provider tokens stay server-side. Agents present a scoped Open-Connect key only.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
