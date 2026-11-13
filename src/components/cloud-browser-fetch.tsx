import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { fetchCloudBrowserPage } from "@/lib/cloud-browser.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Read any public page as clean Markdown (TinyFish Fetch). */
export function CloudBrowserFetch() {
  const fetchFn = useServerFn(fetchCloudBrowserPage);
  const [url, setUrl] = useState("");
  const read = useMutation({ mutationFn: () => fetchFn({ data: { url: url.trim() } }) });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" aria-hidden /> Read a page
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) read.mutate();
          }}
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="cloud-browser-fetch-url">Page URL</Label>
            <Input
              id="cloud-browser-fetch-url"
              type="url"
              value={url}
              placeholder="https://example.com/article"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={!url.trim() || read.isPending}>
            {read.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Fetch
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Renders JavaScript pages and returns clean Markdown. Private and local addresses are
          refused.
        </p>
        {read.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {read.error.message}
          </p>
        ) : null}
        {read.data ? (
          <article className="space-y-2" aria-label="Fetched page">
            <div>
              <p className="font-medium">{read.data.title ?? read.data.final_url}</p>
              <a
                className="text-xs text-muted-foreground underline"
                href={read.data.final_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {read.data.final_url}
              </a>
            </div>
            {read.data.description ? (
              <p className="text-sm text-muted-foreground">{read.data.description}</p>
            ) : null}
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
              {read.data.text || "This page has no readable text."}
            </pre>
            {read.data.truncated ? (
              <p className="text-xs text-muted-foreground">Long page: text was truncated.</p>
            ) : null}
          </article>
        ) : null}
      </CardContent>
    </Card>
  );
}
