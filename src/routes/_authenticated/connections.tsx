import {
  connectionLogin,
  connectionUsesBrowserLogin,
  connectionReconnectReady,
} from "@/lib/connection-login";
import {
  UniversalConnectorDialog,
  type ConnectorInitial,
} from "@/components/universal-connector-dialog";
import { refreshConnectorCapabilities } from "@/lib/connector-capabilities.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Lock, Search, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useRoles } from "@/hooks/use-roles";
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
import { ConnectionAccountCard } from "@/components/connection-account-card";

type CatalogApp = {
  provider: string;
  display_name: string;
  category: string;
  scopes: string[];
  oauth: boolean;
  oauth_ready: boolean;
  oauth_supported?: boolean;
  connection_method?: string;
  auth_methods?: string[];
  logo?: string;
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

function connectionIdentityLine(connection: {
  identity: { label: string; login: string; name: string; email: string };
}) {
  const id = connection.identity;
  return id.email || id.login || id.name || id.label || "";
}
const customProviders = new Set(["custom_mcp", "custom_api"]);

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Connectors — Open-Connect" },
      {
        name: "description",
        content:
          "Connect app accounts, Composio toolkits, and MCP servers. Credentials stay server-side; AI clients and model providers are managed separately.",
      },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const [customInitial, setCustomInitial] = useState<ConnectorInitial | undefined>();
  const [customOpen, setCustomOpen] = useState(false);
  const discoveredLogin = useRef<string | null>(null);
  const refreshCapabilities = useServerFn(refreshConnectorCapabilities);
  const [query, setQuery] = useState("");
  const [installedQuery, setInstalledQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [tab, setTab] = useState<"discover" | "custom" | "installed">("discover");
  const queryClient = useQueryClient();
  const catalogFn = useServerFn(listConnectionCatalog);
  const listFn = useServerFn(listAppConnections);
  const connectFn = useServerFn(connectApp);
  const disconnectFn = useServerFn(disconnectApp);
  const configureFn = useServerFn(configureAppConnection);
  const syncFn = useServerFn(syncComposioConnections);
  const [managedApp, setManagedApp] = useState<CatalogApp | null>(null);
  const [selectedApp, setSelectedApp] = useState<CatalogApp | null>(null);
  const [connectionName, setConnectionName] = useState("");
  const [description, setDescription] = useState("");
  const [authHeader, setAuthHeader] = useState("X-API-Key");
  const [accountLabel, setAccountLabel] = useState("");
  const [reconnectId, setReconnectId] = useState<string | undefined>();
  const [endpointUrl, setEndpointUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key">("bearer");
  const [postOAuth, setPostOAuth] = useState<{ provider: string; until: number } | null>(() => {
    if (typeof window === "undefined") return null;
    const connected = new URLSearchParams(window.location.search).get("connected");
    if (!connected) return null;
    return { provider: connected.toLowerCase(), until: Date.now() + 90_000 };
  });
  const endpointProviders = new Set([
    "proton_pass",
    "proton_drive",
    "supabase",
    "databricks",
    "litellm",
    "custom_mcp",
    "custom_api",
  ]);

  const catalog = useQuery({
    queryKey: ["connection-catalog"],
    queryFn: () => catalogFn({}),
  });
  const mine = useQuery({
    queryKey: ["app-connections", user?.id],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
    refetchInterval: postOAuth ? 3000 : 30_000,
  });

  // Managed OAuth returns to /connections?connected=<provider>. Composio may
  // still be finishing the account handoff, so confirm completion by polling
  // instead of leaving the connection stuck on "Authorization pending".
  useEffect(() => {
    const connected = new URLSearchParams(window.location.search).get("connected");
    if (!connected) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("connected");
    const rest = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + (rest ? "?" + rest : ""),
    );
    toast.info(`Completing ${connected} authorization…`);
  }, []);

  useEffect(() => {
    if (!postOAuth) return;
    const provider = postOAuth.provider;
    const list = mine.data ?? [];
    const hasPending = list.some((c) => c.provider === provider && c.status === "pending");
    const hasConnected = list.some((c) => c.provider === provider && c.status === "connected");
    if (hasConnected && !hasPending) {
      toast.success(`${provider} connected and verified`);
      setTimeout(() => setPostOAuth(null), 0);
      return;
    }
    if (!hasPending || Date.now() > postOAuth.until) {
      toast.info("Authorization is still pending on the provider. Refresh status to check again.");
      setTimeout(() => setPostOAuth(null), 0);
    }
  }, [postOAuth, mine.data]);

  const syncMutation = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (result) => {
      toast.success(
        result.matched
          ? `${result.imported} accounts synced; ${result.existing} already linked`
          : "No authorized accounts match your Open-Connect user. Connect an app to authorize it.",
      );
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-details"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Composio sync failed"),
  });

  useEffect(() => {
    if (!user || !mine.data || discoveredLogin.current === user.id) return;
    discoveredLogin.current = user.id;
    const stale = mine.data.filter(
      (c) =>
        c.status === "connected" &&
        ["custom_mcp", "custom_api"].includes(c.provider) &&
        (!c.metadata.capabilities ||
          Date.now() -
            Date.parse(
              String((c.metadata.capabilities as { checked_at?: string }).checked_at || ""),
            ) >
            3600000),
    );
    void (async () => {
      for (let i = 0; i < stale.length; i += 2) {
        await Promise.allSettled(
          stale.slice(i, i + 2).map((c) => refreshCapabilities({ data: { id: c.id } })),
        );
      }
      if (stale.length) void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    })();
  }, [user, mine.data, refreshCapabilities, queryClient]);
  const connectMutation = useMutation({
    mutationFn: (input: string | { provider: string; connection_id: string }) =>
      connectFn({ data: typeof input === "string" ? { provider: input } : input }),
    onSuccess: (result) => {
      if (result.authorization_url) {
        window.location.assign(result.authorization_url);
        return;
      }
      toast.success("Connection saved securely");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-details"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connect failed"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Connection removed");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-details"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove connection"),
  });

  const configureMutation = useMutation({
    mutationFn: () =>
      configureFn({
        data: {
          ...(reconnectId ? { connection_id: reconnectId } : {}),
          new_account: !reconnectId,
          provider: selectedApp?.provider ?? "",
          display_name: ["custom_mcp", "custom_api"].includes(selectedApp?.provider ?? "")
            ? connectionName || selectedApp?.display_name || ""
            : selectedApp?.display_name || "",
          description,
          auth_header: authHeader,
          account_label: accountLabel,
          endpoint_url: endpointUrl,
          api_key: apiKey,
          auth_type: ["custom_mcp", "custom_api"].includes(selectedApp?.provider ?? "")
            ? authType
            : "bearer",
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
      setReconnectId(undefined);
      setEndpointUrl("");
      setApiKey("");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-details"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Connection failed"),
  });

  const publicCatalog = useMemo(
    () => (catalog.data ?? []).filter((app) => !customProviders.has(app.provider)),
    [catalog.data],
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return publicCatalog.filter((app) => {
      const matchesCat = category === "All" || app.category === category;
      const matchesTerm =
        !term ||
        app.display_name.toLowerCase().includes(term) ||
        app.provider.includes(term) ||
        app.category.toLowerCase().includes(term);
      return matchesCat && matchesTerm;
    });
  }, [publicCatalog, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    for (const app of results) {
      const list = map.get(app.category) ?? [];
      list.push(app);
      map.set(app.category, list);
    }
    const order = [
      "All",
      ...new Set([...connectionCategories, ...results.map((app) => app.category)]),
    ];
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
  const catOptions = [
    "All",
    ...new Set([...connectionCategories, ...(catalog.data ?? []).map((app) => app.category)]),
  ];

  const customCatalog = useMemo(
    () => (catalog.data ?? []).filter((app) => customProviders.has(app.provider)),
    [catalog.data],
  );

  function rankStatus(status: string) {
    if (status === "connected") return 0;
    if (status === "pending") return 1;
    return 2;
  }

  const installedConnections = useMemo(() => {
    const list = (mine.data ?? []).filter((c) => !customProviders.has(c.provider));
    return [...list].sort((a, b) => rankStatus(a.status) - rankStatus(b.status));
  }, [mine.data]);
  const filteredInstalledConnections = useMemo(() => {
    const term = installedQuery.trim().toLowerCase();
    if (!term) return installedConnections;
    return installedConnections.filter(
      (c) =>
        c.display_name.toLowerCase().includes(term) ||
        c.provider.toLowerCase().includes(term) ||
        connectionIdentityLine(c).toLowerCase().includes(term),
    );
  }, [installedConnections, installedQuery]);

  const customConnections = useMemo(
    () => (mine.data ?? []).filter((c) => customProviders.has(c.provider)),
    [mine.data],
  );

  function statusBadgeClass(status: string) {
    if (status === "connected") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    if (status === "pending") return "border-amber-500/40 bg-amber-500/10 text-amber-400";
    if (status === "error" || status === "degraded")
      return "border-red-500/40 bg-red-500/10 text-red-400";
    return "";
  }

  const connectedTotal = installedConnections.filter((c) => c.status === "connected").length;
  const pendingTotal = installedConnections.filter((c) => c.status === "pending").length;

  function renderConnectionCard(connection: NonNullable<typeof mine.data>[number]) {
    const app = (catalog.data ?? []).find((item) => item.provider === connection.provider);
    return (
      <Card key={connection.id} className="flex flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo
            provider={connection.provider}
            name={connection.display_name}
            logoUrl={app?.logo}
          />
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{connection.display_name}</p>
            <p className="text-xs text-muted-foreground">{connection.provider}</p>
            {connection.status === "connected" && connectionIdentityLine(connection) ? (
              <p className="truncate text-xs text-emerald-500">
                Connected as {connectionIdentityLine(connection)}
              </p>
            ) : connection.identity.label ? (
              <p className="truncate text-xs text-muted-foreground">
                {connection.identity.label}
              </p>
            ) : null}
          </div>
        </div>
        <Badge variant="outline" className={`w-fit ${statusBadgeClass(connection.status)}`}>
          {connectionStatusLabel(connection.status)}
        </Badge>
        {connection.status === "error" ? (
          <p className="text-xs text-red-400">
            Check the endpoint URL and credential, then reconnect to retry validation.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {connection.status !== "connected" && customProviders.has(connection.provider) ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                setCustomInitial(connection as ConnectorInitial);
                setCustomOpen(true);
              }}
            >
              Reconnect
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              if (app) setManagedApp(app as CatalogApp);
              else toast.info("Manage accounts is not available for this connector yet.");
            }}
          >
            Manage
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            disabled={disconnectMutation.isPending}
            onClick={() => disconnectMutation.mutate(connection.id)}
          >
            Disconnect
          </Button>
        </div>
      </Card>
    );
  }

  function renderCatalogCard(app: CatalogApp) {
    const connection = connectionsByProvider.get(app.provider);
    const connectedCount = (mine.data ?? []).filter(
      (c) => c.provider === app.provider && c.status === "connected",
    ).length;
    const pendingCount = (mine.data ?? []).filter(
      (c) => c.provider === app.provider && c.status === "pending",
    ).length;
    return (
      <Card key={app.provider} className="flex flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo provider={app.provider} name={app.display_name} logoUrl={app.logo} />
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{app.display_name}</p>
            <p className="text-xs text-muted-foreground">
              {`${app.category} · ${connectionLogin(app).label}`}
            </p>
            {app.auth_methods?.length ? (
              <p className="text-xs text-muted-foreground">Auth: {app.auth_methods.join(" · ")}</p>
            ) : null}
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
                {`${connectedCount} connected · ${pendingCount} pending`}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-blue-600 bg-blue-700 text-white hover:bg-blue-800 hover:text-white focus-visible:ring-2 focus-visible:ring-blue-400"
              disabled={connectMutation.isPending}
              title={
                app.oauth && !app.oauth_ready
                  ? "Official provider OAuth setup is not available yet"
                  : undefined
              }
              onClick={() => setManagedApp(app)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {connection ? "Manage accounts" : "Connect account"}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        Internal · Connectors
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-4xl">Connectors</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Connect external app accounts, Composio toolkits, and MCP servers. Credentials stay
        server-side.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border/70 p-1">
          {(["discover", "custom", "installed"] as const).map((t2) => (
            <button
              key={t2}
              type="button"
              onClick={() => setTab(t2)}
              className={
                tab === t2
                  ? "rounded-md bg-primary/15 px-4 py-1.5 text-sm font-medium text-primary"
                  : "rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {t2 === "discover" ? "Discover" : t2 === "custom" ? "Custom" : "Installed"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {user ? (
            <Button
              variant="outline"
              size="sm"
              disabled={mine.isFetching}
              onClick={() => void mine.refetch()}
            >
              Refresh status
            </Button>
          ) : null}
          {user && isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? "Syncing…" : "Sync Composio accounts"}
            </Button>
          ) : null}
        </div>
      </div>

      {(catalog.isError || mine.isError) && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Could not load connectors. Refresh status or reload the page to retry.
        </p>
      )}

      {tab === "installed" && (
        <div className="mt-8 space-y-4">
          {!user ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">Sign in to manage your connectors.</p>
              <Button asChild size="sm" variant="outline" className="mt-3 shrink-0">
                <Link to="/auth">Sign in</Link>
              </Button>
            </Card>
          ) : installedConnections.length === 0 ? (
            <Card className="p-6">
              <p className="font-medium">No connectors installed</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse the public directory or add a private MCP server to get started.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setTab("discover")}>
                  Browse public directory
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setCustomInitial(undefined);
                    setCustomOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add custom MCP
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {connectedTotal} connected · {pendingTotal} pending
                </p>
                <div className="relative ml-auto w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={installedQuery}
                    onChange={(event) => setInstalledQuery(event.target.value)}
                    placeholder="Search installed…"
                    className="pl-9"
                    aria-label="Search installed connectors"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {filteredInstalledConnections.map((item) => renderConnectionCard(item))}
              </div>
              {filteredInstalledConnections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No installed connectors match this search.
                </p>
              ) : null}
            </>
          )}
        </div>
      )}

      {tab === "discover" && (
        <div className="mt-8 space-y-8">
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search public connectors…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setCategory("All");
                  setQuery("");
                }}
              >
                Show all connectors
              </Button>
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
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.category}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {group.apps.map((app) => renderCatalogCard(app))}
              </div>
            </div>
          ))}
          {grouped.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No public connectors match this filter.
            </p>
          ) : null}
        </div>
      )}

      {tab === "custom" && (
        <div className="mt-8 space-y-8">
          <div>
            <h2 className="text-lg font-semibold">Custom connectors</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Private MCP servers and API endpoints for your account only. Public Composio
              connectors live in Discover.
            </p>
            {user ? (
              <Button
                className="mt-3 shrink-0"
                onClick={() => {
                  setCustomInitial(undefined);
                  setCustomOpen(true);
                }}
              >
                <Plus className="size-4" />
                Add custom MCP
              </Button>
            ) : null}
          </div>
          {customConnections.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {customConnections.map((connection) => renderConnectionCard(connection))}
            </div>
          ) : null}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add a custom connector
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {customCatalog.map((app) => renderCatalogCard(app))}
            </div>
          </div>
        </div>
      )}

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

      <UniversalConnectorDialog
        initial={customInitial}
        open={customOpen}
        onOpenChange={setCustomOpen}
      />
      <Dialog open={Boolean(managedApp)} onOpenChange={(open) => !open && setManagedApp(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {managedApp && (
                <BrandLogo
                  provider={managedApp.provider}
                  name={managedApp.display_name}
                  logoUrl={managedApp.logo}
                  size="sm"
                />
              )}
              {managedApp?.display_name} accounts
            </DialogTitle>
            <DialogDescription>
              Manage each account separately. Adding an account keeps your existing connections.
            </DialogDescription>
          </DialogHeader>
          {managedApp && (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="font-medium">{connectionLogin(managedApp).label}</p>
              <p className="text-sm text-muted-foreground">{connectionLogin(managedApp).detail}</p>
              <p className="text-xs text-muted-foreground">
                OAuth permissions are approved on the provider page. API keys and tokens belong in
                the secure form, never in chat.
              </p>
            </div>
          )}
          <div className="space-y-3">
            {(mine.data ?? [])
              .filter((c) => c.provider === managedApp?.provider)
              .map((c) => (
                <ConnectionAccountCard
                  key={c.id}
                  account={c}
                  statusLabel={
                    c.provider === "custom_api" && c.status === "connected"
                      ? "API schema validated · verify provider access"
                      : connectionStatusLabel(c.status)
                  }
                  busy={disconnectMutation.isPending || connectMutation.isPending}
                  reconnectReady={Boolean(
                    managedApp && connectionReconnectReady(c, managedApp.oauth_ready),
                  )}
                  onDisconnect={() => disconnectMutation.mutate(c.id)}
                  onReconnect={() => {
                    if (!managedApp) return;
                    if (["custom_mcp", "custom_api"].includes(c.provider)) {
                      setCustomInitial(c as ConnectorInitial);
                      setCustomOpen(true);
                      setManagedApp(null);
                      return;
                    }
                    if (connectionUsesBrowserLogin(c)) {
                      toast.info(
                        "Authorize the same provider account to reconnect. The existing connection is kept until you choose to disconnect it.",
                      );
                      connectMutation.mutate({
                        provider: managedApp.provider,
                        connection_id: c.id,
                      });
                    } else {
                      setConnectionName(c.display_name);
                      setDescription(c.metadata.description || "");
                      setAuthHeader(c.metadata.auth_header || "X-API-Key");
                      setReconnectId(c.id);
                      setAccountLabel(c.identity.label || "Default account");
                      setEndpointUrl(c.metadata.endpoint_url || "");
                      setAuthType(
                        c.metadata.auth_type === "none"
                          ? "none"
                          : c.metadata.auth_type === "api_key"
                            ? "api_key"
                            : "bearer",
                      );
                      setApiKey("");
                      setSelectedApp({ ...managedApp, display_name: c.display_name });
                      setManagedApp(null);
                    }
                  }}
                />
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
              if (["custom_mcp", "custom_api"].includes(managedApp.provider)) {
                setCustomInitial(undefined);
                setCustomOpen(true);
                setManagedApp(null);
                return;
              }
              if (managedApp.oauth) connectMutation.mutate(managedApp.provider);
              else {
                setConnectionName("");
                setDescription("");
                setAuthHeader("X-API-Key");
                setReconnectId(undefined);
                setAccountLabel("");
                setEndpointUrl("");
                setApiKey("");
                setSelectedApp(managedApp);
                setManagedApp(null);
              }
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            {managedApp?.oauth && !managedApp.oauth_ready
              ? "Provider setup required"
              : managedApp
                ? connectionLogin(managedApp).action
                : "Connect account"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setCustomInitial(undefined);
              setCustomOpen(true);
              setManagedApp(null);
            }}
          >
            Connect a custom MCP or API endpoint
          </Button>
          <p className="text-xs text-muted-foreground">
            Custom MCP supports discovered OAuth and API/token authentication. API connectors
            require the provider's documented OpenAPI definition and credential.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedApp)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedApp(null);
            setReconnectId(undefined);
            setAccountLabel("");
            setEndpointUrl("");
            setConnectionName("");
            setDescription("");
            setAuthHeader("X-API-Key");
            setApiKey("");
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Connect {selectedApp?.display_name}
            </DialogTitle>
            <DialogDescription>
              The credential is encrypted in Supabase Vault. Agents receive only an opaque
              credential reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {["proton_pass", "proton_drive"].includes(selectedApp?.provider ?? "") && (
              <p className="text-sm text-muted-foreground">
                Connect an isolated Proton executor using its trusted HTTPS MCP endpoint and
                separate bridge bearer token. Complete native Proton login on that host first. Do
                not enter a Proton password or personal access token here. Provider rights still
                apply.
              </p>
            )}
            {selectedApp?.provider === "custom_mcp" && (
              <div className="space-y-2">
                <Label>Common setups</Label>
                <p className="text-xs text-muted-foreground">
                  Professional presets for frequent MCP deployments. Review the fields after
                  applying a preset.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setConnectionName("Composio");
                      setEndpointUrl("https://connect.composio.dev/mcp");
                      setAuthType("api_key");
                      setAuthHeader("x-consumer-api-key");
                      setApiKey("");
                    }}
                  >
                    Composio MCP
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setAuthType("bearer");
                      setApiKey("");
                    }}
                  >
                    Bearer token
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setAuthType("none");
                      setApiKey("");
                    }}
                  >
                    Public · no auth
                  </Button>
                </div>
              </div>
            )}
            {["custom_mcp", "custom_api"].includes(selectedApp?.provider ?? "") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="connection-name">App / connector name</Label>
                  <Input
                    id="connection-name"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    placeholder="My team connector"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connection-description">Description</Label>
                  <Input
                    id="connection-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this connection is used for"
                    maxLength={1000}
                  />
                </div>
              </>
            )}
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
            {["custom_mcp", "custom_api"].includes(selectedApp?.provider ?? "") ? (
              <div className="space-y-2">
                <Label htmlFor="connection-auth-type">MCP authentication</Label>
                <select
                  id="connection-auth-type"
                  value={authType}
                  onChange={(event) =>
                    setAuthType(event.target.value as "none" | "bearer" | "api_key")
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="none">No authentication</option>
                  <option value="bearer">Bearer token</option>
                  <option value="api_key">API key header</option>
                </select>
              </div>
            ) : null}
            {authType === "api_key" &&
              ["custom_mcp", "custom_api"].includes(selectedApp?.provider ?? "") && (
                <div className="space-y-2">
                  <Label htmlFor="connection-auth-header">Credential header name</Label>
                  <Input
                    id="connection-auth-header"
                    value={authHeader}
                    onChange={(e) => setAuthHeader(e.target.value)}
                    placeholder="X-API-Key or x-consumer-api-key"
                  />
                </div>
              )}
            {selectedApp?.provider === "custom_api" && (
              <div className="space-y-2">
                <Label>Common setups</Label>
                <p className="text-xs text-muted-foreground">
                  Frequent header conventions for API connectors. Review the fields after applying a
                  preset.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setAuthType("api_key");
                      setAuthHeader("X-API-Key");
                      setApiKey("");
                    }}
                  >
                    X-API-Key
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setAuthType("api_key");
                      setAuthHeader("Authorization");
                      setApiKey("");
                    }}
                  >
                    Authorization
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setAuthType("none");
                      setApiKey("");
                    }}
                  >
                    Public · no auth
                  </Button>
                </div>
              </div>
            )}
            {selectedApp?.provider === "custom_api" && (
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                Saves a private API URL and credential profile. This does not discover tools or
                execute API requests. A reviewed adapter or MCP server is required for agent tool
                access.
              </p>
            )}
            {selectedApp?.provider === "custom_mcp" && (
              <p className="text-xs text-muted-foreground">
                Use the complete Streamable HTTP MCP endpoint. For Composio Connect, choose API key
                header and enter x-consumer-api-key with your consumer key, or use its OAuth-enabled
                client.
              </p>
            )}
            {!["custom_mcp", "custom_api"].includes(selectedApp?.provider ?? "") ||
            authType !== "none" ? (
              <div className="space-y-2">
                <Label htmlFor="connection-key">
                  {["proton_pass", "proton_drive"].includes(selectedApp?.provider ?? "")
                    ? "Executor bearer token (not a Proton token)"
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
                (["custom_mcp", "custom_api"].includes(selectedApp?.provider ?? "")
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
