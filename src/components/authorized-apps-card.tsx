import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppWindow, Loader2, ShieldOff } from "lucide-react";
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
import { listApiKeys, revokeApiKey } from "@/lib/api-keys.functions";

type Grant = {
  name: string;
  tokenIds: string[];
  scopes: string[];
  lastUsed: string | null;
  granted: string;
  expires: string | null;
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

/**
 * Apps the signed-in user has authorized through Open-Connect's OAuth consent
 * screen (ChatGPT, Claude, registered integrations). Revoking removes every
 * active token the app holds for this account.
 */
export function AuthorizedAppsCard() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listApiKeys);
  const revokeFn = useServerFn(revokeApiKey);
  const [confirm, setConfirm] = useState<Grant | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => listFn() });

  const grants = useMemo(() => {
    const byApp = new Map<string, Grant>();
    for (const key of keys.data ?? []) {
      if (!key.oauth_grant || !key.active) continue;
      const name = key.name.replace(/^OAuth:\s*/, "") || "OAuth app";
      const grant = byApp.get(name) ?? {
        name,
        tokenIds: [],
        scopes: [],
        lastUsed: null,
        granted: key.created_at,
        expires: key.expires_at,
      };
      grant.tokenIds.push(key.id);
      grant.scopes = [...new Set([...grant.scopes, ...key.scopes])];
      if (key.last_used_at && (!grant.lastUsed || key.last_used_at > grant.lastUsed))
        grant.lastUsed = key.last_used_at;
      if (key.created_at < grant.granted) grant.granted = key.created_at;
      if (key.expires_at && (!grant.expires || key.expires_at > grant.expires))
        grant.expires = key.expires_at;
      byApp.set(name, grant);
    }
    return [...byApp.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [keys.data]);

  const revoke = useMutation({
    mutationFn: async (grant: Grant) => {
      for (const id of grant.tokenIds) await revokeFn({ data: { id } });
    },
    onSuccess: (_result, grant) => {
      setConfirm(null);
      toast.success(`${grant.name} no longer has access`);
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not revoke access"),
  });

  return (
    <Card className="shadow-panel">
      <CardHeader className="p-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <AppWindow className="size-5" />
        </div>
        <CardTitle className="mt-3 text-base">Authorized apps</CardTitle>
        <CardDescription>
          Apps you allowed to access your Open-Connect account through “Sign in with Open-Connect”,
          such as ChatGPT, Claude, or a registered integration. Revoke an app to disconnect it
          immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {keys.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading authorized apps…
          </div>
        ) : keys.isError ? (
          <p className="text-sm text-destructive">Could not load authorized apps.</p>
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No apps have access to your account.</p>
        ) : (
          <ul className="space-y-3">
            {grants.map((grant) => (
              <li key={grant.name} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{grant.name}</span>
                    {grant.tokenIds.length > 1 ? (
                      <Badge variant="secondary">{grant.tokenIds.length} sessions</Badge>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setConfirm(grant)}
                  >
                    <ShieldOff className="mr-2 size-3.5" />
                    Revoke access
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {grant.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="font-mono text-[11px]">
                      {scope}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Authorized {when(grant.granted)} · Last used {when(grant.lastUsed)} · Expires{" "}
                  {grant.expires ? when(grant.expires) : "never"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={confirm !== null} onOpenChange={(open) => (!open ? setConfirm(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke {confirm?.name}?</DialogTitle>
            <DialogDescription>
              Its access tokens stop working immediately. The app must ask you to sign in again to
              reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => confirm && revoke.mutate(confirm)}
            >
              Revoke access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
