import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Loader2, Plus, RotateCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createOAuthIntegration,
  listOAuthIntegrations,
  revokeOAuthIntegration,
  rotateOAuthIntegrationSecret,
  updateOAuthIntegration,
} from "@/lib/oauth-integrations.functions";
import { parseRedirectUriList, type OAuthIntegration } from "@/lib/oauth-integrations";

const ISSUER = "https://open-connect.site";
const ENDPOINTS = [
  { label: "Authorization URL", value: `${ISSUER}/oauth/authorize` },
  { label: "Token URL", value: `${ISSUER}/oauth/token` },
  { label: "Discovery", value: `${ISSUER}/.well-known/oauth-authorization-server` },
  { label: "MCP resource", value: `${ISSUER}/mcp` },
];

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
  }
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

type Editor = { mode: "create" } | { mode: "edit"; integration: OAuthIntegration };

export function OAuthIntegrationsCard() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listOAuthIntegrations);
  const createFn = useServerFn(createOAuthIntegration);
  const updateFn = useServerFn(updateOAuthIntegration);
  const rotateFn = useServerFn(rotateOAuthIntegrationSecret);
  const revokeFn = useServerFn(revokeOAuthIntegration);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState("");
  const [redirects, setRedirects] = useState("");
  const [issued, setIssued] = useState<{ client_id: string; client_secret: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<OAuthIntegration | null>(null);

  const integrations = useQuery({
    queryKey: ["oauth-integrations"],
    queryFn: () => listFn(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["oauth-integrations"] });

  function openEditor(next: Editor) {
    setEditor(next);
    setName(next.mode === "edit" ? next.integration.client_name : "");
    setRedirects(next.mode === "edit" ? next.integration.redirect_uris.join("\n") : "");
  }

  const save = useMutation({
    mutationFn: async () => {
      const redirect_uris = parseRedirectUriList(redirects);
      if (editor?.mode === "edit") {
        await updateFn({
          data: { client_id: editor.integration.client_id, name, redirect_uris },
        });
        return null;
      }
      return createFn({ data: { name, redirect_uris } });
    },
    onSuccess: (created) => {
      setEditor(null);
      if (created) {
        setIssued({ client_id: created.client_id, client_secret: created.client_secret });
        toast.success("Integration registered");
      } else toast.success("Integration updated");
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save integration"),
  });

  const rotate = useMutation({
    mutationFn: (client_id: string) => rotateFn({ data: { client_id } }),
    onSuccess: (rotated) => {
      setIssued(rotated);
      toast.success("New client secret issued. The previous secret no longer works.");
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not rotate secret"),
  });

  const revoke = useMutation({
    mutationFn: (client_id: string) => revokeFn({ data: { client_id } }),
    onSuccess: () => {
      setConfirmRevoke(null);
      toast.success("Integration revoked");
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not revoke integration"),
  });

  const items = integrations.data ?? [];
  const redirectCount = parseRedirectUriList(redirects).length;

  return (
    <Card className="shadow-panel">
      <CardHeader className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="size-5" />
            </div>
            <CardTitle className="mt-3 text-base">OAuth integrations</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Register an app to get a client ID and client secret. Other apps can then offer
              “Connect with Open-Connect” as a connector or plugin: users sign in, choose scopes,
              and approve on Open-Connect’s consent screen.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => openEditor({ mode: "create" })}>
            <Plus className="mr-2 size-4" />
            Register an integration
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-5 pb-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {ENDPOINTS.map((endpoint) => (
            <div key={endpoint.label} className="rounded-lg border p-3 text-xs">
              <div className="text-muted-foreground">{endpoint.label}</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all">{endpoint.value}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Copy ${endpoint.label}`}
                  onClick={() => void copy(endpoint.value, endpoint.label)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Authorization code flow with PKCE (S256) is required. Authenticate at the token URL with
          HTTP Basic (<code>client_secret_basic</code>) or <code>client_secret_post</code>, and send{" "}
          <code>resource={ISSUER}/mcp</code>. Administrator scopes are only granted to Admin
          accounts.
        </p>

        {integrations.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading integrations…
          </div>
        ) : integrations.isError ? (
          <p className="text-sm text-destructive">
            {integrations.error instanceof Error
              ? integrations.error.message
              : "Could not load integrations."}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No integrations registered yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const revoked = Boolean(item.revoked_at);
              return (
                <li key={item.client_id} className="rounded-lg border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.client_name}</span>
                      <Badge variant={revoked ? "outline" : "secondary"}>
                        {revoked ? "Revoked" : "Active"}
                      </Badge>
                    </div>
                    {!revoked ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditor({ mode: "edit", integration: item })}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rotate.isPending}
                          onClick={() => rotate.mutate(item.client_id)}
                        >
                          <RotateCw className="mr-2 size-3.5" />
                          Rotate secret
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => setConfirmRevoke(item)}
                        >
                          <ShieldOff className="mr-2 size-3.5" />
                          Revoke
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[9rem_1fr]">
                    <dt className="text-muted-foreground">Client ID</dt>
                    <dd className="flex items-center gap-2">
                      <code className="break-all">{item.client_id}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label="Copy client ID"
                        onClick={() => void copy(item.client_id, "Client ID")}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </dd>
                    <dt className="text-muted-foreground">Client secret</dt>
                    <dd>
                      {revoked ? "—" : <code>{item.client_secret_prefix ?? "oc_sec_"}…</code>}
                    </dd>
                    <dt className="text-muted-foreground">Redirect URLs</dt>
                    <dd className="space-y-1">
                      {item.redirect_uris.map((uri) => (
                        <code key={uri} className="block break-all">
                          {uri}
                        </code>
                      ))}
                    </dd>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDate(item.created_at)}</dd>
                    <dt className="text-muted-foreground">Secret issued</dt>
                    <dd>{formatDate(item.secret_rotated_at)}</dd>
                    {revoked ? (
                      <>
                        <dt className="text-muted-foreground">Revoked</dt>
                        <dd>{formatDate(item.revoked_at)}</dd>
                      </>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={editor !== null} onOpenChange={(open) => (!open ? setEditor(null) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editor?.mode === "edit" ? "Edit integration" : "Register an integration"}
            </DialogTitle>
            <DialogDescription>
              Users are redirected to one of these URLs after authorizing your integration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oauth-integration-name">Name *</Label>
              <Input
                id="oauth-integration-name"
                value={name}
                maxLength={120}
                placeholder="My connector"
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oauth-integration-redirects">OAuth redirect URLs *</Label>
              <Textarea
                id="oauth-integration-redirects"
                rows={4}
                value={redirects}
                placeholder={"https://app.example.com/oauth/callback\nhttp://127.0.0.1/callback"}
                onChange={(event) => setRedirects(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                One per line, up to 10. HTTPS required; http loopback (127.0.0.1, localhost) is
                allowed for desktop apps and matches any port.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={save.isPending || !name.trim() || redirectCount < 1}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editor?.mode === "edit" ? "Save changes" : "Register integration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issued !== null} onOpenChange={(open) => (!open ? setIssued(null) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save your client secret</DialogTitle>
            <DialogDescription>
              This secret is shown once. Store it in your app’s server-side secret manager; it must
              never be shipped in browser or mobile code.
            </DialogDescription>
          </DialogHeader>
          {issued ? (
            <div className="space-y-3 text-sm">
              {[
                { label: "Client ID", value: issued.client_id },
                { label: "Client secret", value: issued.client_secret },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <Label>{row.label}</Label>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2">
                      {row.value}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copy(row.value, row.label)}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>I saved the secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => (!open ? setConfirmRevoke(null) : null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke {confirmRevoke?.client_name}?</DialogTitle>
            <DialogDescription>
              The app can no longer start sign-in or exchange codes. Tokens it already obtained stay
              listed under Personal Tokens as “OAuth: {confirmRevoke?.client_name}” — revoke those
              there too. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => confirmRevoke && revoke.mutate(confirmRevoke.client_id)}
            >
              Revoke integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
