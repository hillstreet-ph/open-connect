import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Link2, Loader2, Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  connectApp,
  configureAppConnection,
  disconnectApp,
  listAppConnections,
  listConnectionCatalog,
} from "@/lib/connections.functions";
import { useAuth } from "@/hooks/use-auth";
import { connectionCategories } from "@/lib/nav";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type CatalogApp = {
  provider: string;
  display_name: string;
  category: string;
  scopes: string[];
  oauth: boolean;
};

function connectionStatusLabel(status: string) {
  if (status === "connected") return "Connected · verified";
  if (status === "pending") return "Authorization pending";
  if (status === "configured_unverified") return "Configured · unverified";
  if (status === "degraded") return "Degraded";
  if (status === "error") return "Error";
  if (status === "disabled") return "Disabled";
  return status.replaceAll("_", " ");
}

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Connectors — Open-Connect" },
      {
        name: "description",
        content:
          "Connect GitHub, Telegram, ChatGPT, Grok and more. Agents get capability, never raw credentials.",
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
  const configureFn = useServerFn(configureAppConnection);
  const [selectedApp, setSelectedApp] = useState<CatalogApp | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key">("bearer");
  const endpointProviders = new Set(["custom_mcp", "supabase", "databricks", "litellm"]);

  const catalog = useQuery({ queryKey: ["connection-catalog"], queryFn: () => catalogFn({}) });
  const mine = useQuery({
    queryKey: ["app-connections"],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
  });

  const connectMutation = useMutation({
    mutationFn: (provider: string) => connectFn({ data: { provider } }),
    onSuccess: (result) => {
      toast.success(
        result.status === "pending" ? "Authorization request created" : "Connection saved securely",
      );
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

  const configureMutation = useMutation({
    mutationFn: () =>
      configureFn({
        data: {
          provider: selectedApp?.provider ?? "",
          display_name: selectedApp?.display_name,
          account_label: accountLabel,
          endpoint_url: endpointUrl,
          api_key: apiKey,
          auth_type: authType,
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.validation.verified
          ? "Connection verified and saved securely"
          : "Credential saved; provider validation is not available yet",
      );
      setSelectedApp(null);
      setAccountLabel("");
      setEndpointUrl("");
      setApiKey("");
      setAuthType("bearer");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connection failed"),
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

  const connectionsByProvider = new Map((mine.data ?? []).map((item) => [item.provider, item]));
  const catOptions = ["All", ...connectionCategories];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        Internal · Connectors
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-4xl">Connectors</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Connect official apps or add a custom MCP endpoint. Open-Connect keeps credentials
        server-side and gives agents only approved capabilities.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            setCategory("All");
            setQuery("");
          }}
        >
          Browse app connectors
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const customMcp = (catalog.data ?? []).find((app) => app.provider === "custom_mcp");
            if (customMcp) setSelectedApp(customMcp as CatalogApp);
          }}
          disabled={!(catalog.data ?? []).some((app) => app.provider === "custom_mcp")}
        >
          Add custom MCP
        </Button>
      </div>

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
              <Card key={c.id} className="flex flex-row items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <BrandLogo provider={c.provider} name={c.display_name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.display_name}</p>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {connectionStatusLabel(c.status)}
                    </Badge>
                  </div>
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
                const connection = connectionsByProvider.get(app.provider);
                return (
                  <Card
                    key={app.provider}
                    className="flex flex-row items-center justify-between gap-3 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BrandLogo provider={app.provider} name={app.display_name} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{app.display_name}</p>
                        <p className="text-xs text-muted-foreground">{app.category}</p>
                      </div>
                    </div>
                    {!user ? (
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link to="/auth">Sign in</Link>
                      </Button>
                    ) : connection ? (
                      <Badge variant="secondary" className="shrink-0">
                        {connectionStatusLabel(connection.status)}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={connectMutation.isPending}
                        onClick={() =>
                          app.oauth
                            ? connectMutation.mutate(app.provider)
                            : setSelectedApp(app as CatalogApp)
                        }
                      >
                        {app.oauth
                          ? "Authorize"
                          : app.provider === "custom_mcp"
                            ? "Add MCP"
                            : "Add key"}
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

      <Dialog open={Boolean(selectedApp)} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedApp?.provider === "custom_mcp" ? (
                <Link2 className="size-5 text-primary" />
              ) : (
                <KeyRound className="size-5 text-primary" />
              )}
              Connect {selectedApp?.display_name}
            </DialogTitle>
            <DialogDescription>
              The credential is encrypted in Supabase Vault. Agents receive only an opaque
              credential reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="connection-account">Account label</Label>
              <Input
                id="connection-account"
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
                placeholder="Production · hillstreet-ph"
              />
            </div>
            {selectedApp && endpointProviders.has(selectedApp.provider) ? (
              <div className="space-y-2">
                <Label htmlFor="connection-endpoint">
                  {selectedApp.provider === "custom_mcp" ? "MCP endpoint URL" : "Service base URL"}
                </Label>
                <Input
                  id="connection-endpoint"
                  type="url"
                  value={endpointUrl}
                  onChange={(event) => setEndpointUrl(event.target.value)}
                  placeholder={
                    selectedApp.provider === "custom_mcp"
                      ? "https://mcp.example.com/mcp"
                      : "https://workspace.example.com"
                  }
                />
              </div>
            ) : null}
            {selectedApp?.provider === "custom_mcp" ? (
              <div className="space-y-2">
                <Label htmlFor="connection-auth">Authentication method</Label>
                <select
                  id="connection-auth"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={authType}
                  onChange={(event) =>
                    setAuthType(event.target.value as "none" | "bearer" | "api_key")
                  }
                >
                  <option value="none">No authentication</option>
                  <option value="bearer">Bearer token</option>
                  <option value="api_key">X-API-Key header</option>
                </select>
              </div>
            ) : null}
            {selectedApp?.provider !== "custom_mcp" || authType !== "none" ? (
              <div className="space-y-2">
                <Label htmlFor="connection-key">
                  {selectedApp?.provider === "custom_mcp"
                    ? "Bearer token / API key"
                    : "API key or access token"}
                </Label>
                <Input
                  id="connection-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Paste credential"
                  className="font-mono"
                />
              </div>
            ) : null}
            <Button
              className="w-full"
              disabled={
                configureMutation.isPending ||
                (selectedApp?.provider === "custom_mcp"
                  ? !endpointUrl.trim() || (authType !== "none" && apiKey.trim().length < 8)
                  : apiKey.trim().length < 8)
              }
              onClick={() => configureMutation.mutate()}
            >
              {configureMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Lock className="mr-2 size-4" />
              )}
              Validate & save connection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
