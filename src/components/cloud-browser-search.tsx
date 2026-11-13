import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileText, Loader2, Search } from "lucide-react";
import { fetchCloudBrowserPage, searchCloudBrowserWeb } from "@/lib/cloud-browser.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = {
  position: number;
  title: string;
  url: string;
  snippet: string;
  site: string | null;
  date: string | null;
};

/**
 * Live web search and page reading on the user's own TinyFish connection.
 * The same capability is exposed to Claude and ChatGPT as the
 * cloud_browser_search and cloud_browser_fetch MCP tools.
 */
export function CloudBrowserSearch() {
  const searchFn = useServerFn(searchCloudBrowserWeb);
  const fetchFn = useServerFn(fetchCloudBrowserPage);
  const [query, setQuery] = useState("");
  const [news, setNews] = useState(false);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const search = useMutation({
    mutationFn: () =>
      searchFn({ data: { query, ...(news ? { domain_type: "news" as const } : {}) } }) as Promise<{
        query: string;
        results: Result[];
      }>,
    onMutate: () => setOpenUrl(null),
  });
  const read = useMutation({
    mutationFn: (url: string) => fetchFn({ data: { url } }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="size-4" aria-hidden /> Search and read the web
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) search.mutate();
          }}
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="cloud-browser-search">Search</Label>
            <Input
              id="cloud-browser-search"
              value={query}
              maxLength={500}
              placeholder="e.g. latest FIFA World Cup news today"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
            News only
          </label>
          <Button type="submit" disabled={!query.trim() || search.isPending}>
            {search.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Search
          </Button>
        </form>
        {search.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {search.error.message}
          </p>
        ) : null}
        {search.data ? (
          search.data.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results.</p>
          ) : (
            <ol className="space-y-3" aria-label="Search results">
              {search.data.results.map((item) => (
                <li key={`${item.position}-${item.url}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.site ?? new URL(item.url).hostname}
                        {item.date ? ` · ${item.date}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={read.isPending && read.variables === item.url}
                        onClick={() => {
                          setOpenUrl(item.url);
                          read.mutate(item.url);
                        }}
                      >
                        <FileText className="mr-1 size-3.5" /> Read
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-3.5" />
                          <span className="sr-only">Open {item.title} in a new tab</span>
                        </a>
                      </Button>
                    </div>
                  </div>
                  {item.snippet ? (
                    <p className="mt-2 text-muted-foreground">{item.snippet}</p>
                  ) : null}
                  {openUrl === item.url ? (
                    <div className="mt-3 rounded-md bg-muted p-3" aria-live="polite">
                      {read.isPending ? (
                        <p className="flex items-center gap-2 text-xs">
                          <Loader2 className="size-3.5 animate-spin" /> Reading page…
                        </p>
                      ) : read.isError ? (
                        <p role="alert" className="text-xs text-destructive">
                          {read.error.message}
                        </p>
                      ) : read.data ? (
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">
                          {read.data.text || "This page has no readable text."}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
