import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { listSetupApps } from "@/lib/app-setup.functions";
import { getConnectionDetails } from "@/lib/connection-details.functions";
import {
  refreshConnectorCapabilities,
  connectorStudioDraft,
} from "@/lib/connector-capabilities.functions";
import { setupFiles, setupZip } from "@/lib/app-setup-bundle";
import {
  installConfiguration,
  SDK_GUIDES,
  setupReadiness,
  type SetupTarget,
} from "@/lib/app-setup";
import inspectTemplate from "@/lib/app-setup-templates/inspect.mjs?raw";
import serverTemplate from "@/lib/app-setup-templates/server.mjs?raw";
import agentTemplate from "@/lib/app-setup-templates/agent.mjs?raw";
import { UniversalConnectorDialog } from "./universal-connector-dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
function download(name: string, bytes: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AppSetupWorkbench() {
  const { user } = useAuth();
  return <AppSetupForm key={user?.id || "signed-out"} userId={user?.id} />;
}
function AppSetupForm({ userId }: { userId: string | undefined }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [name, setName] = useState("My app"),
    [target, setTarget] = useState<SetupTarget>("vscode");
  const listFn = useServerFn(listSetupApps),
    detailFn = useServerFn(getConnectionDetails),
    draftFn = useServerFn(connectorStudioDraft);
  const apps = useQuery({
    queryKey: ["app-setup-connections", userId],
    queryFn: () => listFn(),
    enabled: Boolean(userId),
  });
  const app = apps.data?.find((item) => item.id === selected);
  const refreshFn = useServerFn(refreshConnectorCapabilities);
  const details = useMutation({
    mutationFn: async (id: string) => {
      if (apps.data?.find((item) => item.id === id)?.executionSupported)
        await refreshFn({ data: { id } });
      return { id, details: await detailFn({ data: { connectionId: id } }) };
    },
    onError: (e) => toast.error(e.message),
  });
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { id: selected } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["resources-review-queue"] });
      toast.success("Private plugin draft prepared. Review it before publication.");
    },
    onError: (e) => toast.error(e.message),
  });
  const config = installConfiguration(target);
  const inspected = details.data?.id === selected ? details.data.details : undefined;
  const ready = setupReadiness(
    app?.status || "",
    inspected?.tools.length || 0,
    inspected ? new Date().toISOString() : null,
  );
  function exportStarter() {
    try {
      const bundle = setupFiles(name, app?.executionSupported ? selected : undefined, {
        inspect: inspectTemplate,
        server: serverTemplate,
        agent: agentTemplate,
      });
      download(
        `${bundle.setup.slug}-setup.zip`,
        setupZip(bundle.files) as BlobPart,
        "application/zip",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build setup files");
    }
  }
  return (
    <Card id="app-setup" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>Build & install an app</CardTitle>
        <CardDescription>
          Connect an app, inspect its tools, then export client setup or build a local MCP starter.
          Provider credentials stay in the Vault.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="min-w-0 space-y-3">
            <h3 className="font-semibold">1. Connect & inspect</h3>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setOpen(true)}>Add custom MCP</Button>
              <Button asChild variant="outline">
                <Link to="/connections">Browse apps & accounts</Link>
              </Button>
            </div>
            <Label htmlFor="setup-app">Your app connection</Label>
            <select
              id="setup-app"
              className="w-full rounded-md border bg-background p-2"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                details.reset();
                draft.reset();
              }}
            >
              <option value="">Choose an app (optional for local starter)</option>
              {apps.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.status}
                </option>
              ))}
            </select>
            {apps.isPending && <p role="status">Loading your connections…</p>}
            {apps.isError && (
              <p role="alert">
                Could not load apps.{" "}
                <button className="underline" onClick={() => void apps.refetch()}>
                  Retry
                </button>
              </p>
            )}
            <Button
              variant="outline"
              disabled={!selected || app?.status !== "connected" || details.isPending}
              onClick={() => details.mutate(selected)}
            >
              {details.isPending ? "Inspecting…" : "Inspect app capabilities"}
            </Button>
            {app && !app.executionSupported && (
              <p className="text-xs text-muted-foreground">
                This provider has a managed catalog. Use its provider setup or a custom MCP bridge
                for the exported agent; this starter cannot invoke that provider directly.
              </p>
            )}
            {app && <Badge variant="outline">{ready.label}</Badge>}
            {inspected && (
              <div className="space-y-2 text-sm">
                <p>
                  {inspected.tools.length} enabled tools discovered. {inspected.toolsNotice}
                </p>
                <details>
                  <summary className="cursor-pointer">Tool details</summary>
                  <ul className="mt-2 max-h-52 space-y-2 overflow-auto">
                    {inspected.tools.map((tool) => (
                      <li key={tool.name}>
                        <strong>{tool.name}</strong>
                        <p className="text-muted-foreground">{tool.description}</p>
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="text-muted-foreground">
                  Discovery does not execute an action or prove every tool works. Account scopes and
                  owner permissions apply.
                </p>
              </div>
            )}
            <Button
              variant="outline"
              disabled={!ready.ready || !app?.executionSupported || draft.isPending}
              onClick={() => draft.mutate()}
            >
              Prepare private Studio plugin draft
            </Button>
            <p className="text-xs text-muted-foreground">
              Source, license, permissions and runtime review are required before publication.
            </p>
          </section>
          <section className="min-w-0 space-y-3">
            <h3 className="font-semibold">2. Install in your client</h3>
            <Label htmlFor="setup-target">Client configuration</Label>
            <select
              id="setup-target"
              className="w-full rounded-md border bg-background p-2"
              value={target}
              onChange={(e) => setTarget(e.target.value as SetupTarget)}
            >
              <option value="vscode">VS Code · .vscode/mcp.json</option>
              <option value="cursor">Cursor · .cursor/mcp.json</option>
              <option value="portable">Portable · .mcp.json</option>
            </select>
            <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(config.config, null, 2)}
            </pre>
            <Button
              variant="outline"
              onClick={() =>
                download(
                  config.filename.split("/").pop()!,
                  JSON.stringify(config.config, null, 2),
                  "application/json",
                )
              }
            >
              Download client configuration
            </Button>
            <p className="text-sm text-muted-foreground">
              Merge into <code>{config.filename}</code>, then complete OAuth in the client. This
              connects to Open-Connect; select the app using its connection ID. Nothing is installed
              in another client by downloading this file.
            </p>
            <p className="text-sm">
              ChatGPT: add <code className="break-all">https://open-connect.site/mcp</code> as a
              custom connector and choose OAuth.
            </p>
            <div className="space-y-1 rounded-lg border p-3 text-sm">
              <p className="font-medium">Login flows for apps you build</p>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>OAuth: brokered browser sign-in, token held server-side.</li>
                <li>API key or token: stored encrypted in the Vault.</li>
                <li>Agents only receive an opaque credential reference.</li>
              </ul>
            </div>
            <Button asChild variant="link">
              <Link to="/integrations" search={{ section: "api-key" }}>
                Scoped keys & OAuth setup
              </Link>
            </Button>
          </section>
        </div>
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-semibold">3. Build a client or local server</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="setup-name">App name</Label>
              <Input
                id="setup-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button disabled={!name.trim()} onClick={exportStarter}>
              Download Node setup ZIP
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Includes a working read-only stdio server, self-test, MCP inspector client,
            model-assisted app client, editor configs, and a setup guide. Requires Node 22.19+. Run{" "}
            <code>npm install</code> and <code>npm test</code> locally. The agent client requires a
            connected app, separate local MCP/Gateway keys, and confirmation for tool calls. The
            server is a starting example; implement and test your app-specific actions before
            hosting it.
          </p>
          <Badge variant="outline">Pinned SDK v1 · protocol 2025-11-25</Badge>
          <p className="text-xs text-muted-foreground">
            Modern 2026-07-28 skills APIs and SDK v2 are not implemented by this starter. Local
            stdio/MCP bundles run on the client machine, not this website.
          </p>
          <details>
            <summary className="cursor-pointer text-sm">Other SDKs, Inspector & MCP Apps</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {SDK_GUIDES.map(([label, url]) => (
                <a
                  key={label}
                  className="rounded-md border px-3 py-1 text-sm underline"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {label}
                </a>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm underline">
              <a
                href="https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector"
                target="_blank"
                rel="noreferrer"
              >
                Inspector web / CLI / TUI
              </a>
              <a
                href="https://modelcontextprotocol.io/extensions/apps/overview"
                target="_blank"
                rel="noreferrer"
              >
                Interactive MCP Apps
              </a>
              <a
                href="https://github.com/modelcontextprotocol/mcpb"
                target="_blank"
                rel="noreferrer"
              >
                Local MCP bundles
              </a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              These are official development guides, not installed runtimes or verified app
              integrations.
            </p>
          </details>
        </section>
        <UniversalConnectorDialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) void client.invalidateQueries({ queryKey: ["app-setup-connections"] });
          }}
        />
      </CardContent>
    </Card>
  );
}
