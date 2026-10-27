import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  CREDENTIAL_IMPORT_MAX_BYTES,
  dedupeImportItems,
  importSourceLabel,
  parseCredentialFile,
  summarizeImportItem,
  type ExistingCredentialIdentity,
  type ImportItem,
} from "@/lib/credential-import";
import { importCredentials, type CredentialImportResult } from "@/lib/secrets.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const BATCH = 50;
const FILTERS = ["ready", "notes", "duplicate", "skipped", "failed"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = {
  ready: "Ready",
  notes: "With changes",
  duplicate: "Duplicates",
  skipped: "Skipped",
  failed: "Failed",
};

export function CredentialImport({ existing }: { existing: ExistingCredentialIdentity[] }) {
  const importFn = useServerFn(importCredentials);
  const queryClient = useQueryClient();
  // Secret-bearing items stay in component memory only and are dropped after import.
  const [items, setItems] = useState<ImportItem[]>([]);
  const [results, setResults] = useState<Map<number, CredentialImportResult>>(new Map());
  const [filter, setFilter] = useState<Filter>("ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const generation = useRef(0);

  const summaries = useMemo(() => items.map(summarizeImportItem), [items]);
  const counts = useMemo(() => {
    const failed = [...results.values()].filter((r) => r.status === "failed").length;
    return {
      ready: summaries.filter((s) => s.status === "ready").length,
      notes: summaries.filter((s) => s.status === "ready" && s.reasons.length).length,
      duplicate: summaries.filter((s) => s.status === "duplicate").length,
      skipped: summaries.filter((s) => s.status === "skipped").length,
      failed,
      totp: summaries.filter((s) => s.status === "ready" && s.has_totp).length,
    };
  }, [summaries, results]);
  const visible = summaries.filter((s) => {
    const result = results.get(s.row);
    if (filter === "failed") return result?.status === "failed";
    if (filter === "notes") return s.status === "ready" && s.reasons.length > 0;
    return s.status === filter;
  });

  function reset() {
    generation.current++;
    setItems([]);
    setResults(new Map());
    setError("");
    setBusy(false);
    setProgress(null);
  }

  async function load(file: File | undefined) {
    reset();
    const current = generation.current;
    if (!file) return;
    if (file.size > CREDENTIAL_IMPORT_MAX_BYTES) {
      setError("Choose an export file up to 10 MB.");
      return;
    }
    setBusy(true);
    try {
      // Parsed locally: nothing leaves the browser until you choose Import.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseCredentialFile(file.name, bytes);
      if (current !== generation.current) return;
      setItems(dedupeImportItems(parsed, existing));
      setFilter("ready");
    } catch (cause) {
      // Parser messages are fixed strings; never show raw file content.
      const message = cause instanceof Error ? cause.message : "";
      if (current === generation.current)
        setError(
          /Encrypted|Password-protected|Unsupported|Not a ZIP|no supported/.test(message)
            ? `${message}.`
            : "Unable to read this file. Export as CSV, ZIP or unencrypted JSON (UTF-8).",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  async function runImport() {
    const current = generation.current;
    const ready = items.filter((item) => item.status === "ready" && !results.has(item.row));
    if (!ready.length) return;
    setBusy(true);
    setProgress(0);
    const next = new Map(results);
    try {
      for (let i = 0; i < ready.length; i += BATCH) {
        const batch = ready.slice(i, i + BATCH);
        const response = await importFn({
          data: {
            items: batch.map((item) => ({
              row: item.row,
              name: item.name,
              secret_type: item.secret_type,
              secret_value: item.password,
              email_address: item.email_address,
              username: item.username,
              website: item.website,
              notes: item.notes,
              totp_secret: item.totp_secret,
              tags: item.tags,
            })),
          },
        });
        if (current !== generation.current) return;
        response.forEach((result) => next.set(result.row, result));
        setResults(new Map(next));
        setProgress(Math.round(((i + batch.length) / ready.length) * 100));
      }
      const created = [...next.values()].filter((r) => r.status === "created").length;
      const failed = [...next.values()].filter((r) => r.status === "failed").length;
      toast.success(`Imported ${created} credential${created === 1 ? "" : "s"}`);
      if (failed) {
        toast.error(`${failed} item${failed === 1 ? "" : "s"} could not be saved`);
        setFilter("failed");
      }
      // Drop secret values from memory once saved; keep only display-safe results.
      setItems((all) =>
        all.map((item) =>
          next.get(item.row)?.status === "created"
            ? { ...item, password: "", totp_secret: "", notes: "" }
            : item,
        ),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Import stopped");
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["credential-secrets"] });
    }
  }

  const source = items[0] ? importSourceLabel(items[0].source) : "";
  const remaining = items.filter((i) => i.status === "ready" && !results.has(i.row)).length;

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" /> Import from a password manager or browser
        </CardTitle>
        <CardDescription>
          Supports Proton Pass (ZIP or CSV), Bitwarden (CSV or unencrypted JSON), 1Password CSV,
          LastPass CSV and Chrome, Edge, Brave, Firefox or Safari password CSV. Files are read in
          your browser; only the items you import are sent to your encrypted Vault. Logins keep
          their email, username, website, notes and 2FA (TOTP) keys. Passkeys cannot be moved
          between password managers: rows that had passkeys are marked so you can create new ones.
          Delete the export file after importing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Label htmlFor="credential-import-file">Export file (CSV, ZIP or JSON, up to 10 MB)</Label>
        <Input
          id="credential-import-file"
          type="file"
          accept=".csv,.zip,.json,text/csv,application/zip,application/json,application/vnd.ms-excel,application/octet-stream"
          disabled={busy}
          onChange={(event) => {
            void load(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        {busy && progress === null && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading export…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {items.length > 0 && (
          <>
            <p role="status" className="text-sm">
              {source} export: {items.length} items. <strong>{counts.ready} ready</strong> (
              {counts.totp} with 2FA), {counts.duplicate} duplicates, {counts.skipped} skipped.
            </p>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => setFilter(key)}
                >
                  {FILTER_LABEL[key]} ({counts[key]})
                </Button>
              ))}
            </div>
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Import items, secrets hidden</caption>
                <thead className="sticky top-0 bg-background">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Website</th>
                    <th className="p-2">Account</th>
                    <th className="p-2">2FA</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 500).map((row) => {
                    const result = results.get(row.row);
                    return (
                      <tr key={row.row} className="border-t align-top">
                        <td className="max-w-40 break-words p-2">{row.name}</td>
                        <td className="max-w-40 break-all p-2">{row.site || "—"}</td>
                        <td className="p-2">{row.account || "—"}</td>
                        <td className="p-2">
                          {row.has_totp ? (
                            <ShieldCheck className="h-4 w-4 text-primary" aria-label="Has 2FA" />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={result?.status === "failed" ? "destructive" : "secondary"}
                          >
                            {result?.status ?? row.status}
                          </Badge>
                          {[...(result?.reason ? [result.reason] : []), ...row.reasons].map(
                            (reason) => (
                              <p key={reason} className="mt-1 text-xs text-muted-foreground">
                                {reason}
                              </p>
                            ),
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visible.length > 500 && (
                <p className="p-2 text-xs text-muted-foreground">
                  Showing 500 of {visible.length}.
                </p>
              )}
            </div>
            {progress !== null && <Progress value={progress} aria-label="Import progress" />}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || remaining === 0} onClick={() => void runImport()}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Import {remaining} credential{remaining === 1 ? "" : "s"}
              </Button>
              <Button variant="outline" disabled={busy} onClick={reset}>
                Clear
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
