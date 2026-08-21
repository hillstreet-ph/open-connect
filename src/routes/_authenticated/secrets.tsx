import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSecret,
  deleteSecret,
  listSecrets,
  SECRET_SCOPES,
  type SecretType,
} from "@/lib/secrets.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/secrets")({
  head: () => ({
    meta: [
      { title: "Secrets — Open-Connect" },
      { name: "description", content: "Scoped credential vault for API keys, tokens and bot secrets." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecretsPage,
});

const TYPES: { value: SecretType; label: string }[] = [
  { value: "api_key", label: "API key" },
  { value: "oauth_token", label: "OAuth token" },
  { value: "mcp_url", label: "MCP URL / token" },
  { value: "bot_token", label: "Bot token" },
  { value: "password", label: "Password" },
  { value: "other", label: "Other" },
];

function SecretsPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSecrets);
  const createFn = useServerFn(createSecret);
  const deleteFn = useServerFn(deleteSecret);

  const [name, setName] = useState("");
  const [secretType, setSecretType] = useState<SecretType>("api_key");
  const [value, setValue] = useState("");
  const [scopes, setScopes] = useState<string[]>(["connections"]);

  const list = useQuery({
    queryKey: ["credential-secrets"],
    queryFn: async () => {
      try {
        return await listFn({});
      } catch (e) {
        console.warn("[secrets]", e);
        return [];
      }
    },
  });

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: { name, secret_type: secretType, scopes, secret_value: value },
      }),
    onSuccess: () => {
      toast.success("Secret stored — value is not shown again");
      setName("");
      setValue("");
      void queryClient.invalidateQueries({ queryKey: ["credential-secrets"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error
          ? e.message.includes("relation") || e.message.includes("does not exist")
            ? "Secrets table not applied yet — run the credential_secrets migration in Supabase"
            : e.message
          : "Could not save secret",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Secret deleted");
      void queryClient.invalidateQueries({ queryKey: ["credential-secrets"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Lock className="size-5" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold">Secrets</h1>
          <p className="text-sm text-muted-foreground">
            Password-manager style vault. Values are stored server-side and never re-displayed.
          </p>
        </div>
      </div>

      <Card className="mt-8 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Add credential</CardTitle>
          <CardDescription>
            Scope which planes may use this secret: resources, connections, models, MCP, agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="secret-name">Name</Label>
            <Input
              id="secret-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Telegram bot · production"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secret-type">Type</Label>
            <select
              id="secret-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={secretType}
              onChange={(e) => setSecretType(e.target.value as SecretType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Scopes</Label>
            <div className="flex flex-wrap gap-2">
              {SECRET_SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleScope(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
                    scopes.includes(s)
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secret-value">Secret value</Label>
            <Input
              id="secret-value"
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste token / key / password"
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name.trim() || !value.trim()}
          >
            {createMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Lock className="mr-2 size-4" />}
            Store secret
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Stored credentials</CardTitle>
          <CardDescription>Metadata only — secret values are never listed.</CardDescription>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No secrets yet.</p>
          ) : (
            <ul className="space-y-2">
              {(list.data ?? []).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {row.secret_type}
                      </Badge>
                      {(row.scopes ?? []).map((s: string) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(row.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
