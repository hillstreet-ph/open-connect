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
      const published = data.results.filter((r) => r.status === "published");
      toast.success(
        published.length > 0
          ? `Import complete. ${published.length} resource(s) published to Marketplace.`
          : "Import complete. Nothing new was published.",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import website or GitHub resources</CardTitle>
        <CardDescription>
          Download every detected resource and publish it to Marketplace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="resource-source-url">Source URL</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="resource-source-url"
            className="min-w-0 flex-1"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.skills.sh/"
          />
          <Button disabled={mutation.isPending || !url.trim()} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Fetching & publishing…" : "Import & publish"}
          </Button>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Static checks screen archives, secrets and executable payloads.</p>
          <p>They are not an antivirus verdict.</p>
          <p>Imports never execute code or overwrite a published version.</p>
          <p>Blocked or flagged imports stay private for review.</p>
        </div>
        {mutation.data?.results.map((r, i) => (
          <div
            key={`${r.name}-${i}`}
            className="flex flex-wrap items-start gap-2 rounded-lg border p-3"
          >
            <Badge
              className={
                r.status === "blocked" || r.status === "failed"
                  ? "border-red-500/40 bg-red-500/15 text-red-300"
                  : r.status === "published"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : r.status === "duplicate"
                      ? "border-violet-500/40 bg-violet-500/15 text-violet-300"
                      : "border-amber-500/40 bg-amber-500/15 text-amber-300"
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
