import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, Square } from "lucide-react";
import {
  cancelCloudBrowserResearch,
  getCloudBrowserResearch,
  listCloudBrowserResearch,
  startCloudBrowserResearch,
} from "@/lib/cloud-browser-workspace.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Source-backed research reports (TinyFish Research API, deep or max mode). */
export function CloudBrowserResearch() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listCloudBrowserResearch);
  const startFn = useServerFn(startCloudBrowserResearch);
  const getFn = useServerFn(getCloudBrowserResearch);
  const cancelFn = useServerFn(cancelCloudBrowserResearch);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"deep" | "max">("deep");
  const [selected, setSelected] = useState<string | null>(null);

  const runs = useQuery({ queryKey: ["cloud-research"], queryFn: () => listFn(), retry: false });
  const run = useQuery({
    queryKey: ["cloud-research", selected],
    queryFn: () => getFn({ data: { id: selected! } }),
    enabled: Boolean(selected),
    refetchInterval: (q) => (q.state.data?.terminal ? false : 15_000),
  });
  const start = useMutation({
    mutationFn: () => startFn({ data: { query: query.trim(), mode } }),
    onSuccess: (data) => {
      setQuery("");
      setSelected(data.research_run_id);
      void queryClient.invalidateQueries({ queryKey: ["cloud-research"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cloud-research"] }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" aria-hidden /> New research
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim()) start.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="cloud-research-query">Question</Label>
              <Textarea
                id="cloud-research-query"
                rows={3}
                maxLength={10_000}
                value={query}
                placeholder="e.g. Compare the main long-duration energy storage approaches"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="research-mode"
                  checked={mode === "deep"}
                  onChange={() => setMode("deep")}
                />
                Deep (5–20 min)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="research-mode"
                  checked={mode === "max"}
                  onChange={() => setMode("max")}
                />
                Max (5–45 min)
              </label>
              <Button type="submit" disabled={!query.trim() || start.isPending}>
                {start.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Start research
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses your TinyFish daily allowance, then your TinyFish wallet.
            </p>
            {start.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {start.error.message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {selected && run.data ? (
        <Card aria-live="polite">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{run.data.query}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={run.data.status === "COMPLETED" ? "default" : "secondary"}>
                {run.data.status}
              </Badge>
              {!run.data.terminal ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(run.data.research_run_id)}
                >
                  <Square className="mr-1 size-3.5" /> Cancel
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {run.data.report ? (
              <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {run.data.report}
              </pre>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Researching… this page refreshes
                automatically.
              </p>
            )}
            {run.data.citations.length ? (
              <div>
                <p className="font-medium">Sources</p>
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {run.data.citations.map((url) => (
                    <li key={url}>
                      <a className="underline" href={url} target="_blank" rel="noopener noreferrer">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Research history</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.isLoading ? (
            <p role="status">Loading research…</p>
          ) : runs.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {runs.error.message}
            </p>
          ) : runs.data?.length ? (
            <ul className="divide-y rounded-md border text-sm">
              {runs.data.map((item) => (
                <li key={item.research_run_id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => setSelected(item.research_run_id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.query}</span>
                    <Badge variant="outline">{item.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No research runs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
