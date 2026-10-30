import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Unplug, Wrench, UserRound, Pencil } from "lucide-react";
import {
  refreshConnectorCapabilities,
  setConnectorToolPermission,
  connectorStudioDraft,
} from "@/lib/connector-capabilities.functions";
import { renameAppConnection } from "@/lib/connections.functions";
import { toast } from "sonner";
import { getConnectionDetails } from "@/lib/connection-details.functions";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@tanstack/react-router";

type Account = {
  id: string;
  provider: string;
  display_name: string;
  status: string;
  provider_account_id: string | null;
  scopes: string[] | null;
  logo?: string;
  metadata?: {
    endpoint_url?: string;
    description?: string;
    auth_type?: string;
    auth_header?: string;
    icon_data?: string;
    capabilities?: unknown;
    disabled_tools?: string[];
  };
  identity: { label: string; login: string; name: string; email: string };
};

type PermissionMode = "allow" | "ask" | "deny";

type ConnectorPermissions = { tools: PermissionMode; skills: PermissionMode };

const defaultPermissions: ConnectorPermissions = { tools: "allow", skills: "allow" };

export function ConnectionAccountCard({
  account,
  statusLabel,
  busy,
  reconnectReady,
  onReconnect,
  onDisconnect,
}: {
  account: Account;
  statusLabel: string;
  busy: boolean;
  reconnectReady: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const client = useQueryClient();
  const refreshFn = useServerFn(refreshConnectorCapabilities),
    permissionFn = useServerFn(setConnectorToolPermission),
    draftFn = useServerFn(connectorStudioDraft);
  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { id: account.id } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["app-connections"] });
      void client.invalidateQueries({ queryKey: ["connection-details", account.id] });
    },
    onError: (e) => toast.error(e.message),
  });
  const permission = useMutation({
    mutationFn: (input: { tool: string; enabled: boolean }) =>
      permissionFn({ data: { id: account.id, ...input } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["app-connections"] });
      void client.invalidateQueries({ queryKey: ["connection-details", account.id] });
    },
    onError: (e) => toast.error(e.message),
  });
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { id: account.id } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["resources-review-queue"] });
      toast.success("Private connector plugin draft is ready in Studio review");
    },
    onError: (e) => toast.error(e.message),
  });
  const snapshot = account.metadata?.capabilities as
    | {
        tools?: Array<{ name: string; description?: string }>;
        prompts?: unknown[];
        resources?: unknown[];
        catalog_scope?: string;
      }
    | undefined;
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [permissions, setPermissions] = useState<Record<string, ConnectorPermissions>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem("connector-permissions");
      return stored ? (JSON.parse(stored) as Record<string, ConnectorPermissions>) : {};
    } catch {
      return {};
    }
  });

  function updatePermission(scope: "tools" | "skills", value: PermissionMode) {
    const current = permissions[account.id] ?? defaultPermissions;
    const next = { ...permissions, [account.id]: { ...current, [scope]: value } };
    setPermissions(next);
    try {
      window.localStorage.setItem("connector-permissions", JSON.stringify(next));
    } catch {
      // Storage may be unavailable; the in-memory preference still applies.
    }
  }
  const renameFn = useServerFn(renameAppConnection);
  const rename = useMutation({
    mutationFn: (input: { displayName: string; accountLabel: string }) =>
      renameFn({ data: { id: account.id, ...input } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["app-connections"] });
      void client.invalidateQueries({ queryKey: ["connection-details", account.id] });
      setEditing(false);
      toast.success("Account name updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const detailsFn = useServerFn(getConnectionDetails);
  const details = useQuery({
    queryKey: ["connection-details", account.id, account.status],
    queryFn: () => detailsFn({ data: { connectionId: account.id } }),
    enabled: expanded || account.status === "connected",
    staleTime: 60_000,
    refetchInterval: 15_000,
  });
  const identity = details.data?.identity ?? account.identity;
  const title = identity.name || identity.login || identity.email || identity.label;
  const rawIdentityLines = [
    identity.email,
    identity.login ? `@${identity.login}` : "",
    identity.label,
  ];
  const identityLines: string[] = [];
  for (const line of rawIdentityLines) {
    const trimmed = line.trim();
    if (trimmed && trimmed !== title && !identityLines.includes(trimmed)) {
      identityLines.push(trimmed);
    }
  }
  const tools = (snapshot?.tools ?? details.data?.tools ?? [])
    .map((t) => ({ name: t.name, description: t.description || "" }))
    .filter((tool) =>
      `${tool.name} ${tool.description}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <article className="min-w-0 space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <BrandLogo
            provider={account.provider}
            name={account.display_name}
            logoUrl={account.logo}
            size="sm"
            className="mb-2"
          />
          {account.display_name !== title && (
            <p className="mb-1 break-words text-sm font-semibold">{account.display_name}</p>
          )}
          {account.metadata?.icon_data && (
            <img src={account.metadata.icon_data} alt="" className="mb-2 size-8 rounded-lg" />
          )}
          <div className="flex items-center gap-2">
            <p className="flex min-w-0 items-center gap-2 font-medium">
              <UserRound className="size-4 shrink-0" aria-hidden="true" />
              <span className="break-words">{title || "Account identity unavailable"}</span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto size-7 shrink-0 p-0"
              aria-label="Edit account name"
              onClick={() => {
                setEditName(account.display_name);
                setEditLabel(identity.label || account.identity.label || "");
                setEditing(true);
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <Input
                aria-label="Connector display name"
                placeholder="Display name"
                maxLength={120}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
              <Input
                aria-label="Account label"
                placeholder="Account label"
                maxLength={160}
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={rename.isPending}
                  onClick={() =>
                    rename.mutate({ displayName: editName, accountLabel: editLabel })
                  }
                >
                  {rename.isPending ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {identityLines.map((line) => (
            <p key={line} className="break-all text-xs text-muted-foreground">
              {line}
            </p>
          ))}
          {account.metadata?.description && (
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {account.metadata.description}
            </p>
          )}
          {account.metadata?.endpoint_url && (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {account.metadata.endpoint_url}
            </p>
          )}
          {account.metadata?.auth_type && (
            <p className="mt-1 text-xs text-muted-foreground">
              Authentication: {account.metadata.auth_type}
              {account.metadata.auth_type === "api_key"
                ? ` · ${account.metadata.auth_header || "X-API-Key"}`
                : ""}
            </p>
          )}
          <p className="mt-1 truncate text-xs text-muted-foreground/70">
            Account reference: {account.provider_account_id || account.id}
          </p>
        </div>
        <Badge variant="outline">{statusLabel}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !reconnectReady}
          onClick={onReconnect}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Reconnect
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onDisconnect}>
          <Unplug className="size-4" aria-hidden="true" />
          {account.status === "pending" ? "Cancel verification" : "Disconnect"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={`capabilities-${account.id}`}
          onClick={() => setExpanded(!expanded)}
        >
          <Wrench className="size-4" aria-hidden="true" />
          {expanded ? "Hide details" : "Tools, skills & capabilities"}
        </Button>
      </div>
      {["custom_mcp", "custom_api"].includes(account.provider) && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={refresh.isPending || !["connected", "degraded"].includes(account.status)}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? "Discovering…" : "Refresh capabilities"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={draft.isPending}
            onClick={() => draft.mutate()}
          >
            Create plugin in Studio
          </Button>
          {snapshot && (
            <p className="w-full text-xs text-muted-foreground">
              {snapshot.tools?.length || 0} tools · {snapshot.prompts?.length || 0} prompts ·{" "}
              {snapshot.resources?.length || 0} resource descriptors ·{" "}
              {snapshot.catalog_scope || "snapshot"}
            </p>
          )}
        </div>
      )}
      {expanded ? (
        <div id={`capabilities-${account.id}`} className="min-w-0 space-y-3 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Account capabilities</p>
            <Button
              size="sm"
              variant="ghost"
              disabled={details.isFetching}
              onClick={() => void details.refetch()}
            >
              Refresh
            </Button>
          </div>
          {details.isPending ? (
            <p role="status" className="text-sm">
              Loading account details…
            </p>
          ) : null}
          {details.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load account details. Refresh to try again.
            </p>
          ) : null}
          {details.data?.identityNotice ? (
            <p className="text-xs text-muted-foreground">{details.data.identityNotice}</p>
          ) : null}
          <Tabs defaultValue="tools" className="min-w-0">
            <TabsList className="flex h-auto max-w-full flex-wrap justify-start overflow-x-auto">
              <TabsTrigger value="tools">Tools ({details.data?.tools.length ?? 0})</TabsTrigger>
              <TabsTrigger value="skills">Skills ({details.data?.skills.length ?? 0})</TabsTrigger>
              <TabsTrigger value="toolkits">
                Toolkits ({details.data?.toolkits.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </TabsList>
            <TabsContent value="tools" className="space-y-3">
              <Input
                aria-label="Search connector tools"
                placeholder="Search tools…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {details.data?.toolsNotice ? (
                <p className="text-xs text-muted-foreground">{details.data.toolsNotice}</p>
              ) : null}
              <div className="max-h-72 space-y-2 overflow-auto">
                {tools.map((tool) => (
                  <div key={tool.name} className="rounded-lg border p-3">
                    <p className="break-all text-sm font-medium">{tool.name}</p>
                    {snapshot?.tools && (
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!account.metadata?.disabled_tools?.includes(tool.name)}
                          disabled={permission.isPending}
                          onChange={(e) =>
                            permission.mutate({ tool: tool.name, enabled: e.target.checked })
                          }
                        />
                        Allow this tool for this connection
                      </label>
                    )}
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {tool.description}
                    </p>
                  </div>
                ))}
              </div>
              {details.isSuccess && !tools.length ? (
                <p className="text-sm text-muted-foreground">
                  No tools to display{search ? " for this search" : ""}.
                </p>
              ) : null}
            </TabsContent>
            <TabsContent value="skills" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Related skills saved in your workspace. Skills guide workflows; they do not grant
                account access.
              </p>
              {details.data?.skills.map((skill) => (
                <div key={skill.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{skill.name}</p>
                  <p className="text-xs text-muted-foreground">{skill.description}</p>
                  <Badge variant="outline">{skill.verified ? "Verified" : "Unverified"}</Badge>
                </div>
              ))}
              {details.isSuccess && !details.data.skills.length ? (
                <p className="text-sm text-muted-foreground">No related saved skills.</p>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link to="/library">Open resources</Link>
              </Button>
            </TabsContent>
            <TabsContent value="toolkits" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Related toolkits already in your private library. Discovery does not install,
                publish, or grant permissions.
              </p>
              {details.data?.toolkits.map((toolkit) => (
                <div key={toolkit.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{toolkit.name}</p>
                  <p className="text-xs text-muted-foreground">{toolkit.description}</p>
                </div>
              ))}
              {details.isSuccess && !details.data?.toolkits.length ? (
                <p className="text-sm text-muted-foreground">
                  No related toolkits in your library.
                </p>
              ) : null}
            </TabsContent>
            <TabsContent value="permissions" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Granted scopes reported for this connection.
              </p>
              <div className="flex flex-wrap gap-2">
                {account.scopes?.map((scope) => (
                  <Badge
                    key={scope}
                    variant="outline"
                    className="max-w-full whitespace-normal break-all"
                  >
                    {scope}
                  </Badge>
                ))}
              </div>
              {!account.scopes?.length ? (
                <p className="text-sm text-muted-foreground">
                  The provider has not reported scopes. Tool listings do not imply permission to run
                  them.
                </p>
              ) : null}
              <div className="space-y-2 rounded-lg border border-border/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Agent access
                </p>
                {(["tools", "skills"] as const).map((scope) => {
                  const current = permissions[account.id] ?? defaultPermissions;
                  return (
                    <label
                      key={scope}
                      className="flex items-center justify-between gap-3 text-sm capitalize"
                    >
                      {scope}
                      <select
                        value={current[scope]}
                        onChange={(event) =>
                          updatePermission(scope, event.target.value as PermissionMode)
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="allow">Always allow</option>
                        <option value="ask">Ask every time</option>
                        <option value="deny">Don&apos;t allow</option>
                      </select>
                    </label>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Applies when agents use this connector. Default is Always allow.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </article>
  );
}
