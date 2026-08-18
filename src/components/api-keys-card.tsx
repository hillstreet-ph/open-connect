import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ApiKeysCard() {
  const queryClient = useQueryClient();
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const [name, setName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => list({}) });

  const createMutation = useMutation({
    mutationFn: (keyName: string) => create({ data: { name: keyName } }),
    onSuccess: (result) => {
      setFreshKey(result.key);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key created — copy it now, it won't be shown again.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create key"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key revoked");
    },
  });

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <KeyRound className="size-4" />
        </span>
        <CardTitle className="mt-3 text-base">API Keys</CardTitle>
        <CardDescription>
          Scoped <code className="font-mono">oc_live_</code> keys authenticate your agents against{" "}
          <code className="font-mono">/v1</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate(name);
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name (e.g. local agent)"
          />
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Create
          </Button>
        </form>

        {freshKey ? (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Copy this key now — it is only shown once.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-xs text-primary">{freshKey}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(freshKey);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        <ul className="space-y-2 text-sm">
          {keys.data?.length ? (
            keys.data.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{key.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{key.key_prefix}…</span>
                </span>
                {key.revoked_at ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Revoked
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revokeMutation.mutate(key.id)}
                    disabled={revokeMutation.isPending}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">No keys yet.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
