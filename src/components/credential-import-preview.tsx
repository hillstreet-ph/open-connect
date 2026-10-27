import { useRef, useState } from "react";
import {
  previewCredentialCsv,
  previewCredentialJson,
  CREDENTIAL_IMPORT_MAX_BYTES,
  type CredentialPreview,
  type ExistingCredentialIdentity,
} from "@/lib/credential-import-preview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CredentialImportPreview({ existing }: { existing: ExistingCredentialIdentity[] }) {
  const [rows, setRows] = useState<CredentialPreview[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function preview(file: File | undefined) {
    const current = ++generation.current;
    setRows([]);
    setError("");
    if (!file) return;
    if (file.size > CREDENTIAL_IMPORT_MAX_BYTES) {
      setError("Choose a CSV or JSON file up to 10 MB.");
      return;
    }
    const format = file.name.toLowerCase().split(".").pop();
    if (format !== "csv" && format !== "json") {
      setError("Only CSV and flat JSON previews are supported.");
      return;
    }
    setBusy(true);
    try {
      // No network request, query cache, analytics or browser persistence.
      const bytes = await file.arrayBuffer();
      if (current !== generation.current) return;
      const input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const result =
        format === "csv"
          ? previewCredentialCsv(input, existing)
          : previewCredentialJson(input, existing);
      setRows(result);
    } catch {
      // Parser exceptions can contain source data. Never display them.
      if (current === generation.current)
        setError("Unable to preview. Check UTF-8 encoding, supported fields and file limits.");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-base">Review an import file</CardTitle>
        <CardDescription>
          Preview only. Nothing is uploaded or saved to Vault. Accounts are masked and secret fields
          are omitted. Proton Pass CSV exports are supported for review, including email and username
          fields. CSV requires a website and an account column; JSON requires an array of flat records
          with url and username. Optional type is password or api_key. ZIP, Google Sheets and batch
          saving are not available yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Label htmlFor="credential-import-file">CSV or JSON file (UTF-8, up to 10 MB)</Label>
        <Input
          id="credential-import-file"
          type="file"
          accept=".csv,.json,text/csv,text/plain,application/json,application/vnd.ms-excel,application/octet-stream"
          disabled={busy}
          onChange={(event) => {
            void preview(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        {busy && <p role="status">Preparing preview…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <p role="status" className="text-sm">
              {rows.length} rows reviewed. {rows.filter((row) => row.status === "review").length}{" "}
              need attention. No credentials saved.
            </p>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Credential file preview, first 100 rows</caption>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Origin</th>
                    <th>Account</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={row.row} className="border-t">
                      <td className="p-2">{row.row}</td>
                      <td className="max-w-40 break-all p-2">{row.origin || "Invalid"}</td>
                      <td className="p-2">{row.account || "Missing"}</td>
                      <td className="p-2">{row.issues.join("; ") || "Preview valid"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                generation.current++;
                setRows([]);
                setError("");
                setBusy(false);
              }}
            >
              Clear preview
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
