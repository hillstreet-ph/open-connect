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
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["resources-review-queue"] });
      void client.invalidateQueries({ queryKey: ["my-resources"] });
      toast.success("Import inspected. Check draft and blocked results before publication.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import website or GitHub resources</CardTitle>
        <CardDescription>
          Import public documents, SKILL.md and plugin/OpenAPI manifests into private Studio review.
          GitHub repository imports pin the commit and detect up to 25 resource files.
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
            placeholder="https://github.com/owner/repository"
          />
          <Button disabled={mutation.isPending || !url.trim()} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Fetching & inspecting…" : "Import for review"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Static checks detect unsafe archives, embedded secret patterns and executable payloads.
          They are not an antivirus verdict. Imports never execute code, overwrite a published
          version or publish automatically.
        </p>
        {mutation.data?.results.map((r, i) => (
          <div
            key={`${r.name}-${i}`}
            className="flex flex-wrap items-start gap-2 rounded-lg border p-3"
          >
            <Badge
              className={
                r.status === "blocked" || r.status === "failed"
                  ? "border-red-500/40 bg-red-500/15 text-red-300"
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
