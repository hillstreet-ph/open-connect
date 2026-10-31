import { defaultConnectorAuth, authForProtocol } from "@/lib/connection-login";
import { PROVIDER_API_PRESETS } from "@/lib/provider-api-presets";
import { loadPluginSchema } from "@/lib/connector-manifest.functions";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { configureAppConnection } from "@/lib/connections.functions";
import { refreshConnectorCapabilities } from "@/lib/connector-capabilities.functions";
import { openApiOperations } from "@/lib/openapi-connector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export type ConnectorInitial = {
  id: string;
  provider: string;
  display_name: string;
  identity: { label: string };
  metadata: Record<string, unknown>;
};
export function UniversalConnectorDialog({
  open,
  onOpenChange,
  initial,
}: {
  initial?: ConnectorInitial | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <ConnectorForm
          key={initial?.id || "new"}
          initial={initial}
          onComplete={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
function ConnectorForm({
  onComplete,
  initial,
}: {
  onComplete: () => void;
  initial?: ConnectorInitial | undefined;
}) {
  const [name, setName] = useState(initial?.display_name || ""),
    [description, setDescription] = useState(String(initial?.metadata["description"] || "")),
    [label, setLabel] = useState(initial?.identity.label || ""),
    [endpoint, setEndpoint] = useState(String(initial?.metadata["endpoint_url"] || "")),
    [protocol, setProtocol] = useState<"http" | "sse" | "openapi">(
      (initial?.metadata["transport"] ||
        (initial?.provider === "custom_api" ? "openapi" : "http")) as "http" | "sse" | "openapi",
    ),
    [auth, setAuth] = useState(
      defaultConnectorAuth(
        initial?.provider === "custom_api" ? "openapi" : "http",
        initial?.metadata["auth_type"],
      ),
    ),
    [header, setHeader] = useState(String(initial?.metadata["auth_header"] || "X-API-Key")),
    [secret, setSecret] = useState(""),
    [icon, setIcon] = useState(String(initial?.metadata["icon_data"] || "")),
    [schema, setSchema] = useState<unknown>(initial?.metadata["openapi"]);
  const file = useRef<HTMLInputElement>(null),
    iconFile = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const loadSchema = useServerFn(loadPluginSchema);
  const save = useServerFn(configureAppConnection),
    discover = useServerFn(refreshConnectorCapabilities);
  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        provider: protocol === "openapi" ? "custom_api" : "custom_mcp",
        display_name: name,
        description,
        account_label: label,
        endpoint_url: endpoint,
        transport: protocol,
        openapi: schema,
        icon_data: icon,
        api_key: secret,
        auth_header: header,
        new_account: !initial?.id,
        ...(initial?.id ? { connection_id: initial.id } : {}),
      };
      const result = await save({
        data: {
          ...input,
          auth_type: auth as "none" | "bearer" | "api_key" | "personal_access_token",
        },
      });
      await discover({ data: { id: result.id } }).catch(() =>
        toast.info("Connection saved. Capability discovery can be retried from its account card."),
      );
      return result;
    },
    onSuccess: () => {
      setSecret("");
      void client.invalidateQueries({ queryKey: ["app-connections"] });
      toast.success("Connection saved; discovered capabilities are available in its account card");
      onComplete();
    },
    onError: (e) => toast.error(e.message),
  });
  async function importFile(f: File) {
    try {
      if (f.size > 1024 * 1024) throw new Error("Connector manifests must be 1 MB or smaller");
      let doc = JSON.parse(await f.text());
      if (doc.api?.url && !doc.openapi) {
        const manifest = doc;
        const loaded = await loadSchema({ data: { url: String(doc.api.url) } });
        doc = JSON.parse(loaded.schema_json);
        doc.info = {
          ...doc.info,
          title: manifest.name_for_human || doc.info?.title,
          description: manifest.description_for_human || doc.info?.description,
        };
      }
      if (doc.openapi) {
        const api = openApiOperations(doc);
        setSchema(doc);
        setProtocol("openapi");
        setAuth((current) => authForProtocol("openapi", current));
        setSecret("");
        setEndpoint(api.endpoint);
        setName(api.title);
        setDescription(api.description);
        return;
      }
      const entry = doc.mcpServers ? Object.entries(doc.mcpServers)[0] : null;
      const config = (entry ? entry[1] : doc) as Record<string, unknown>;
      const url = String(config["url"] || config["serverUrl"] || config["server_url"] || "");
      if (!url)
        throw new Error(
          "Use an OpenAPI 3.x or MCP JSON manifest with a server URL. Executable/local plugin packages belong in Studio review.",
        );
      setEndpoint(url);
      setProtocol(config["type"] === "sse" ? "sse" : "http");
      setName(String(doc.name || entry?.[0] || "Custom connector"));
      setDescription(String(doc.description || ""));
      toast.success("Manifest detected. Review its endpoint and enter the credential.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not inspect manifest");
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add custom MCP</DialogTitle>
        <DialogDescription>
          One private connector profile for MCP HTTP, SSE or an OpenAPI-defined API. Tools remain
          subject to account scopes and owner permissions.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {!initial && (
          <div className="space-y-2">
            <Label htmlFor="provider-preset">Organization API preset (optional)</Label>
            <select
              id="provider-preset"
              defaultValue=""
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              onChange={(event) => {
                const preset = PROVIDER_API_PRESETS.find((item) => item.id === event.target.value);
                if (!preset) return;
                setName(preset.name);
                setDescription(preset.description);
                setEndpoint(preset.endpoint);
                setProtocol("openapi");
                setAuth(preset.auth);
                setHeader(preset.header);
                setSchema(preset.schema);
                setSecret("");
              }}
            >
              <option value="">Choose a reviewed setup template</option>
              {PROVIDER_API_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Use an existing account connection when available. Provider Admin keys are separate
              from ChatGPT or Claude app login. No operation runs during setup.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {icon && <img src={icon} alt="Connector icon" className="size-12 rounded-lg" />}
          <input
            ref={iconFile}
            type="file"
            accept="image/png"
            className="sr-only"
            aria-label="Connector PNG icon"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.type !== "image/png" || f.size > 10240) {
                toast.error("Use a PNG icon up to 10 KB");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setIcon(String(reader.result));
              reader.readAsDataURL(f);
            }}
          />
          <Button variant="outline" onClick={() => iconFile.current?.click()}>
            Add icon (optional)
          </Button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Upload a connector manifest"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
          <Button variant="outline" onClick={() => file.current?.click()}>
            Upload plugin / OpenAPI JSON
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="universal-name">Name</Label>
          <Input
            id="universal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="My custom connector"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="universal-description">Description</Label>
          <Input
            id="universal-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="universal-label">Account label</Label>
            <Input
              id="universal-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Personal / production"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="universal-protocol">Connection</Label>
            <select
              id="universal-protocol"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={protocol}
              onChange={(e) => {
                const next = e.target.value as typeof protocol;
                setProtocol(next);
                setAuth(authForProtocol(next, auth));
              }}
            >
              <option value="http" disabled={initial?.provider === "custom_api"}>
                MCP · HTTP (Streamable)
              </option>
              <option value="sse" disabled={initial?.provider === "custom_api"}>
                MCP · SSE
              </option>
              <option value="openapi" disabled={initial?.provider === "custom_mcp"}>
                API · OpenAPI 3.x
              </option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="universal-url">Server / API URL</Label>
          <Input
            id="universal-url"
            type="url"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://example.com/mcp"
          />
          {protocol === "openapi" && (
            <p className="text-xs text-muted-foreground">
              Upload an OpenAPI JSON definition to discover and validate operations. No API
              operation runs during setup.
            </p>
          )}
        </div>
        {auth === "api_key" && (
          <div className="space-y-2">
            <Label htmlFor="universal-header">Credential header</Label>
            <Input
              id="universal-header"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
            />
          </div>
        )}
        {auth !== "none" && (
          <div className="space-y-2">
            <Label htmlFor="universal-secret">Credential / token</Label>
            <Input
              id="universal-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste the server's access token or API key. It is encrypted at rest and never shared
              with agents.
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Connecting discovers tool, prompt and resource descriptors. It does not execute tools,
          install code or bypass provider consent.
        </p>
        <Button
          className="w-full"
          disabled={
            mutation.isPending ||
            !name.trim() ||
            !endpoint.trim() ||
            (protocol === "openapi" && !schema) ||
            (auth !== "none" && secret.trim().length < 8)
          }
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Connecting…" : "Connect & discover"}
        </Button>
        <Button asChild variant="link">
          <Link to="/studio">Create or upload a connector plugin in Studio</Link>
        </Button>
      </div>
    </>
  );
}
