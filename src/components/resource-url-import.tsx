import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importResourceUrl } from "@/lib/resource-import.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
export function ResourceUrlImport() {
  const [url, setUrl] = useState("");
  const fn = useServerFn(importResourceUrl);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fn({ data: { url } }),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ["resources-review-queue"] });
      void client.invalidateQueries({ queryKey: ["my-resources"] });
      const drafts = data.results.filter((r) => ["draft", "update-candidate"].includes(r.status));
      toast.success(
        drafts.length > 0
          ? `Import complete. ${drafts.length} private draft(s) ready for review.`
          : "Import complete. No new drafts were saved.",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle className="text-base">Import website or GitHub resources</CardTitle>
        <CardDescription>
          Save detected resources as private drafts for review before publication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="resource-source-url">Source URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="resource-source-url"
            className="min-w-0 flex-1"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.skills.sh/"
          />
          <Button
            className="w-full whitespace-nowrap sm:w-auto"
            disabled={mutation.isPending || !url.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Importing drafts…" : "Import drafts"}
          </Button>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Static checks screen archives, secrets and executable payloads.</p>
          <p>They are not an antivirus verdict.</p>
          <p>Imports never execute code or overwrite a published version.</p>
          <p>All imports require independent security and license review before publication.</p>
        </div>
        {mutation.data?.results.map((r, i) => (
          <div
            key={`${r.name}-${i}`}
            className="flex flex-wrap items-start gap-2 rounded-lg border p-3"
          >
            <Badge
              className={
                r.status === "blocked" || r.status === "failed"
                  ? "border-destructive/40 bg-destructive/15 text-destructive"
                  : r.status === "published"
                    ? "border-success/40 bg-success/15 text-success"
                    : r.status === "duplicate"
                      ? "border-chart-4/40 bg-chart-4/15 text-chart-4"
                      : "border-warning/40 bg-warning/15 text-warning"
              }
            >
              {r.status}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{r.name}</p>
              {r.detail && <p className="break-words text-xs text-muted-foreground">{r.detail}</p>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
