import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Link2, Loader2, Lock, Search, Plus, X, Unplug } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  connectApp,
  configureAppConnection,
  disconnectApp,
  listAppConnections,
  listConnectionCatalog,
  syncComposioConnections,
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
  oauth_ready: boolean;
  connection_method?: string;
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
          "Connect external apps and accounts with OAuth or secure API keys and tokens. AI and MCP integrations are managed separately.",
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
  const syncFn = useServerFn(syncComposioConnections);
  const [managedApp, setManagedApp] = useState<CatalogApp | null>(null);
  const [selectedApp, setSelectedApp] = useState<CatalogApp | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key" | "personal_access_token">(
    "bearer",
  );
  const endpointProviders = new Set(["custom_mcp", "supabase", "databricks", "litellm"]);

  const catalog = useQuery({ queryKey: ["connection-catalog"], queryFn: () => catalogFn({}) });
  const mine = useQuery({
    queryKey: ["app-connections"],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (result) => {
      toast.success(
        result.matched
          ? `${result.imported} accounts synced; ${result.existing} already linked`
          : "No authorized accounts match your Open-Connect user. Connect an app to authorize it.",
      );
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Composio sync failed"),
  });

  const connectMutation = useMutation({
    mutationFn: (provider: string) => connectFn({ data: { provider } }),
    onSuccess: (result) => {
      if (result.authorization_url) {
        window.location.assign(result.authorization_url);
        return;
      }
      toast.success("Connection saved securely");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connect failed"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Connection removed");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove connection"),
  });

  const configureMutation = useMutation({
    mutationFn: () =>
      configureFn({
        data: {
          provider: selectedApp?.provider ?? "",
          display_name: selectedApp?.display_name ?? "",
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
      const hasWorkingConnection = !app.oauth || app.oauth_ready;
      const matchesCat = (category === "All" || app.category === category) && hasWorkingConnection;
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

  const connectionsByProvider = new Map<string, NonNullable<typeof mine.data>[number]>();
  for (const item of mine.data ?? []) {
    const current = connectionsByProvider.get(item.provider);
    if (!current || (item.status === "connected" && current.status !== "connected")) {
      connectionsByProvider.set(item.provider, item);
    }
  }
  const catOptions = ["All", ...connectionCategories];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        Internal · Connectors
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-4xl">Connectors</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Connect the external app accounts Open-Connect uses. AI clients and MCP entry points are
        managed separately in Integrations. Credentials stay server-side.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {user && (
          <>
            <Button asChild variant="outline">
              <Link to="/integrations">AI and MCP integrations</Link>
            </Button>
            <Button
              variant="outline"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? "Syncing…" : "Sync Composio accounts"}
            </Button>
            <Button
              variant="outline"
              disabled={mine.isFetching}
              onClick={() => void mine.refetch()}
            >
              Refresh status
            </Button>
          </>
        )}
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
          Connect custom MCP
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
              aria-pressed={category === c}
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

      {(catalog.isError || mine.isError) && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Could not load connectors. Refresh status or reload the page to retry.
        </p>
      )}

      <div className="mt-10 space-y-8">
        {grouped.map((group) => (
          <div key={group.category}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.category}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.apps.map((app) => {
                const connection = connectionsByProvider.get(app.provider);
                return (
                  <Card key={app.provider} className="flex flex-col gap-4 p-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <BrandLogo provider={app.provider} name={app.display_name} />
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug">{app.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {app.provider === "custom_mcp"
                            ? "Custom MCP endpoint"
                            : `${app.category} · ${app.connection_method === "managed_oauth" && app.oauth_ready ? "Composio" : "Official provider"}`}
                        </p>
                      </div>
                    </div>
                    {!user ? (
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link to="/auth">Sign in</Link>
                      </Button>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {connection && (
                          <Badge variant="outline">
                            {
                              (mine.data ?? []).filter(
                                (c) => c.provider === app.provider && c.status === "connected",
                              ).length
                            }{" "}
                            connected ·{" "}
                            {
                              (mine.data ?? []).filter(
                                (c) => c.provider === app.provider && c.status === "pending",
                              ).length
                            }{" "}
                            pending
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-blue-600 bg-blue-700 text-white hover:bg-blue-800 hover:text-white focus-visible:ring-2 focus-visible:ring-blue-400"
                          disabled={
                            !connection &&
                            (connectMutation.isPending || (app.oauth && !app.oauth_ready))
                          }
                          title={
                            app.oauth && !app.oauth_ready
                              ? "Official provider OAuth setup is not available yet"
                              : undefined
                          }
                          onClick={() =>
                            connection
                              ? setManagedApp(app as CatalogApp)
                              : app.oauth
                                ? connectMutation.mutate(app.provider)
                                : setSelectedApp(app as CatalogApp)
                          }
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          {connection
                            ? "Manage accounts"
                            : app.oauth
                              ? app.oauth_ready
                                ? "Connect"
                                : "Setup required"
                              : app.provider === "custom_mcp"
                                ? "Connect"
                                : "Connect"}
                        </Button>
                      </div>
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

      <Dialog open={Boolean(managedApp)} onOpenChange={(open) => !open && setManagedApp(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{managedApp?.display_name} accounts</DialogTitle>
            <DialogDescription>
              Manage each account separately. Adding an account keeps your existing connections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(mine.data ?? [])
              .filter((c) => c.provider === managedApp?.provider)
              .map((c, index) => (
                <div key={c.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Account {index + 1}</p>
                    <Badge variant="outline">{connectionStatusLabel(c.status)}</Badge>
                  </div>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Account details</summary>
                    <p className="mt-2 break-all">Reference: {c.provider_account_id || c.id}</p>
                  </details>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-200 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-400"
                    disabled={disconnectMutation.isPending}
                    onClick={() => disconnectMutation.mutate(c.id)}
                  >
                    {c.status === "pending" ? (
                      <X aria-hidden="true" className="size-4" />
                    ) : (
                      <Unplug aria-hidden="true" className="size-4" />
                    )}
                    {c.status === "pending" ? "Cancel verification" : "Disconnect"}
                  </Button>
                </div>
              ))}
          </div>
          <Button
            className="bg-blue-700 text-white hover:bg-blue-800 hover:text-white"
            disabled={
              !managedApp ||
              connectMutation.isPending ||
              (managedApp.oauth && !managedApp.oauth_ready)
            }
            onClick={() => {
              if (!managedApp) return;
              if (managedApp.oauth) connectMutation.mutate(managedApp.provider);
              else {
                setSelectedApp(managedApp);
                setManagedApp(null);
              }
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            {managedApp?.oauth && !managedApp.oauth_ready
              ? "Provider setup required"
              : "Connect another account"}
          </Button>
        </DialogContent>
      </Dialog>

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
                    setAuthType(
                      event.target.value as "none" | "bearer" | "api_key" | "personal_access_token",
                    )
                  }
                >
                  <option value="none">No authentication</option>
                  <option value="bearer">Bearer token</option>
                  <option value="api_key">API key header</option>
                  <option value="personal_access_token">Personal access token</option>
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
