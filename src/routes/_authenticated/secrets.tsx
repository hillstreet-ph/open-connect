import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Check,
  Clipboard,
  Eye,
  EyeOff,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSecret,
  deleteSecret,
  getTotpCode,
  listSecrets,
  revealSecret,
  SECRET_SCOPES,
  type SecretType,
} from "@/lib/secrets.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/secrets")({
  head: () => ({
    meta: [
      { title: "Secrets — Open-Connect" },
      {
        name: "description",
        content: "Scoped credential vault for API keys, tokens and bot secrets.",
      },
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
  { value: "totp", label: "2FA authenticator (TOTP)" },
  { value: "other", label: "Other" },
];

function SecretsPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSecrets);
  const createFn = useServerFn(createSecret);
  const deleteFn = useServerFn(deleteSecret);
  const totpFn = useServerFn(getTotpCode);
  const revealFn = useServerFn(revealSecret);

  const [name, setName] = useState("");
  const [secretType, setSecretType] = useState<SecretType>("api_key");
  const [value, setValue] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [username, setUsername] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [scopes, setScopes] = useState<string[]>(["connections"]);
  const [showValue, setShowValue] = useState(false);
  const [totpCodes, setTotpCodes] = useState<Record<string, { code: string; seconds: number }>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

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
        data: {
          name,
          secret_type: secretType,
          scopes,
          secret_value: value,
          email_address: emailAddress,
          username,
          website,
          notes,
          totp_secret: totpSecret,
        },
      }),
    onSuccess: () => {
      toast.success("Credential stored securely");
      setName("");
      setValue("");
      setEmailAddress("");
      setUsername("");
      setWebsite("");
      setNotes("");
      setTotpSecret("");
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
      setPendingDelete(null);
      toast.success("Secret deleted");
      void queryClient.invalidateQueries({ queryKey: ["credential-secrets"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const totpMutation = useMutation({
    mutationFn: (id: string) => totpFn({ data: { id } }),
    onSuccess: (result, id) => {
      setTotpCodes((previous) => ({
        ...previous,
        [id]: { code: result.code, seconds: result.seconds_remaining },
      }));
      window.setTimeout(
        () =>
          setTotpCodes((previous) => {
            const next = { ...previous };
            delete next[id];
            return next;
          }),
        result.seconds_remaining * 1000,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not generate 2FA code"),
  });

  const revealMutation = useMutation({
    mutationFn: (id: string) => revealFn({ data: { id } }),
    onSuccess: (result, id) => {
      setRevealedValues((previous) => ({ ...previous, [id]: result.value }));
      window.setTimeout(
        () =>
          setRevealedValues((previous) => {
            const next = { ...previous };
            delete next[id];
            return next;
          }),
        30_000,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reveal credential"),
  });

  async function copyTotp(id: string, code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success("2FA code copied");
    window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
  }

  async function copyCredential(id: string, valueToCopy: string) {
    await navigator.clipboard.writeText(valueToCopy);
    setCopiedId(id);
    toast.success("Credential copied");
    window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-14">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Lock className="size-5" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold">Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Password-manager style vault for passwords, API keys, and copy-ready 2FA codes.
          </p>
        </div>
      </div>

      <Card className="mt-8 overflow-hidden border-border/80 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Add login or credential</CardTitle>
          <CardDescription>
            Store a password or key with an optional authenticator setup key in one encrypted item.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4">
            <Label htmlFor="secret-name">Title</Label>
            <Input
              id="secret-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GitHub · production"
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
          <div className="overflow-hidden rounded-xl border border-border/80 bg-muted/20">
            <div className="relative border-b border-border/70 p-3 pl-12">
              <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Label htmlFor="credential-email" className="sr-only">
                Email address
              </Label>
              <Input
                id="credential-email"
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="Email address"
                className="border-0 bg-transparent shadow-none"
              />
            </div>
            <div className="relative border-b border-border/70 p-3 pl-12">
              <UserRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Label htmlFor="credential-username" className="sr-only">
                Username
              </Label>
              <Input
                id="credential-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="border-0 bg-transparent shadow-none"
              />
            </div>
            <div className="relative border-b border-border/70 p-3 pl-12">
              <KeyRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Label htmlFor="secret-value" className="sr-only">
                Credential value
              </Label>
              <Input
                id="secret-value"
                type={showValue ? "text" : "password"}
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  secretType === "totp"
                    ? "Paste the Base32 authenticator key"
                    : "Password, token, or API key"
                }
                className="pr-11 font-mono"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1 size-8"
                onClick={() => setShowValue((current) => !current)}
                aria-label={showValue ? "Hide credential" : "Show credential"}
              >
                {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            {secretType !== "totp" ? (
              <div className="relative p-3 pl-12">
                <Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Label htmlFor="totp-secret" className="sr-only">
                  2FA setup key
                </Label>
                <Input
                  id="totp-secret"
                  type="password"
                  autoComplete="off"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  placeholder="2FA secret key (TOTP) · optional"
                  className="border-0 bg-transparent font-mono shadow-none"
                />
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            For 2FA, paste the manual Base32 setup key—not the current six-digit code. Passwords and
            TOTP seeds are encrypted separately in Vault.
          </p>
          <div className="relative rounded-xl border border-border/80 bg-muted/20 p-3 pl-12">
            <Globe className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Label htmlFor="credential-website" className="sr-only">
              Website
            </Label>
            <Input
              id="credential-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="Website"
              className="border-0 bg-transparent shadow-none"
            />
          </div>
          <div className="relative rounded-xl border border-border/80 bg-muted/20 p-3 pl-12">
            <FileText className="absolute left-4 top-5 size-4 text-muted-foreground" />
            <Label htmlFor="credential-notes" className="sr-only">
              Notes
            </Label>
            <Textarea
              id="credential-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="min-h-20 resize-y border-0 bg-transparent shadow-none"
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name.trim() || !value.trim()}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Lock className="mr-2 size-4" />
            )}
            Store secret
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Stored credentials</CardTitle>
          <CardDescription>
            Values stay hidden until you explicitly reveal them. Revealed values clear after 30
            seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No secrets yet.</p>
          ) : (
            <ul className="space-y-2">
              {(list.data ?? []).map((row) => (
                <li key={row.id} className="rounded-xl border border-border px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      {row.email_address || row.username ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {row.email_address || row.username}
                        </p>
                      ) : null}
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
                    <div className="flex flex-wrap items-center gap-1">
                      {revealedValues[row.id] ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 font-mono"
                          aria-label={`Copy credential value for ${row.name}`}
                          onClick={() => copyCredential(row.id, revealedValues[row.id])}
                        >
                          {copiedId === row.id ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Clipboard className="size-3.5" />
                          )}
                          <span className="max-w-32 truncate">{revealedValues[row.id]}</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => revealMutation.mutate(row.id)}
                          disabled={revealMutation.isPending}
                        >
                          <Eye className="size-3.5" /> Reveal
                        </Button>
                      )}
                      {row.has_totp ? (
                        totpCodes[row.id] ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 font-mono"
                            aria-label={`Copy 2FA code for ${row.name}`}
                            onClick={() => copyTotp(row.id, totpCodes[row.id].code)}
                          >
                            {copiedId === row.id ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Clipboard className="size-3.5" />
                            )}
                            {totpCodes[row.id].code}
                            <span className="font-sans text-[10px] text-muted-foreground">
                              {totpCodes[row.id].seconds}s
                            </span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => totpMutation.mutate(row.id)}
                            disabled={totpMutation.isPending}
                          >
                            <KeyRound className="size-3.5" /> Show 2FA code
                          </Button>
                        )
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${row.name}`}
                        onClick={() => setPendingDelete({ id: row.id, name: row.name })}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {row.website || row.notes ? (
                    <div className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                      {row.website ? <p className="truncate">{row.website}</p> : null}
                      {row.notes ? (
                        <p className="mt-1 line-clamp-2 whitespace-pre-wrap">{row.notes}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete credential permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{pendingDelete?.name}” and its encrypted Vault entries. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!pendingDelete || deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
