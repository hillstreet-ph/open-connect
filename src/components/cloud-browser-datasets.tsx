import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  createCloudBrowserDataset,
  getCloudBrowserDatasetRows,
  listCloudBrowserDatasets,
  updateCloudBrowserDataset,
} from "@/lib/cloud-browser-workspace.functions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Describe a table in one sentence and TinyFish fills it from the web (TinySet). */
export function CloudBrowserDatasets() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listCloudBrowserDatasets);
  const createFn = useServerFn(createCloudBrowserDataset);
  const rowsFn = useServerFn(getCloudBrowserDatasetRows);
  const updateFn = useServerFn(updateCloudBrowserDataset);
  const [prompt, setPrompt] = useState("");
  const [rows, setRows] = useState(25);
  const [selected, setSelected] = useState<string | null>(null);

  const datasets = useQuery({
    queryKey: ["cloud-datasets"],
    queryFn: () => listFn(),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.some((item) => item.status === "populating") ? 15_000 : false,
  });
  const table = useQuery({
    queryKey: ["cloud-dataset-rows", selected],
    queryFn: () => rowsFn({ data: { id: selected! } }),
    enabled: Boolean(selected),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["cloud-datasets"] });
    void queryClient.invalidateQueries({ queryKey: ["cloud-dataset-rows"] });
  };
  const create = useMutation({
    mutationFn: () => createFn({ data: { prompt: prompt.trim(), target_rows: rows } }),
    onSuccess: (dataset) => {
      setPrompt("");
      setSelected(dataset.id);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (input: { id: string; action: "populate" | "delete" }) => updateFn({ data: input }),
    onSuccess: (_result, input) => {
      if (input.action === "delete" && selected === input.id) setSelected(null);
      refresh();
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" aria-hidden /> New dataset
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (prompt.trim().length >= 3) create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="dataset-prompt">Describe the table</Label>
              <Textarea
                id="dataset-prompt"
                rows={3}
                maxLength={15_000}
                value={prompt}
                placeholder="e.g. Specialty coffee shops in Oakland with website, Google rating and whether they roast on site"
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="dataset-rows">Rows</Label>
                <Input
                  id="dataset-rows"
                  type="number"
                  min={1}
                  max={250}
                  className="w-28"
                  value={rows}
                  onChange={(event) =>
                    setRows(Math.min(250, Math.max(1, Number(event.target.value) || 1)))
                  }
                />
              </div>
              <Button type="submit" disabled={prompt.trim().length < 3 || create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Create and fill
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Planning the columns can take up to a minute. Filling continues in the background.
            </p>
            {create.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {create.error.message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your datasets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {update.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {update.error.message}
            </p>
          ) : null}
          {datasets.isLoading ? (
            <p role="status">Loading datasets…</p>
          ) : datasets.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {datasets.error.message}
            </p>
          ) : datasets.data?.length ? (
            <ul className="divide-y rounded-md border text-sm">
              {datasets.data.map((dataset) => (
                <li
                  key={dataset.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium underline-offset-2 hover:underline"
                    onClick={() => setSelected(dataset.id)}
                  >
                    {dataset.name}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {dataset.row_count}/{dataset.target_rows} rows
                  </span>
                  <Badge variant={dataset.status === "ready" ? "default" : "secondary"}>
                    {dataset.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending || dataset.status === "populating"}
                    onClick={() => update.mutate({ id: dataset.id, action: "populate" })}
                  >
                    <RefreshCw className="mr-1 size-3.5" /> Fill again
                  </Button>
                  <ConfirmDelete
                    title={`Delete ${dataset.name}?`}
                    description="The dataset and all its rows are removed from TinyFish. This cannot be undone."
                    onConfirm={() => update.mutate({ id: dataset.id, action: "delete" })}
                  >
                    <Button size="sm" variant="outline" className="text-destructive">
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Delete dataset</span>
                    </Button>
                  </ConfirmDelete>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No datasets yet.</p>
          )}

          {selected ? (
            table.isLoading ? (
              <p role="status">Loading rows…</p>
            ) : table.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {table.error.message}
              </p>
            ) : table.data ? (
              table.data.rows.length ? (
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted">
                      <tr>
                        {table.data.columns.map((column) => (
                          <th key={column.name} scope="col" className="px-2 py-1.5 font-medium">
                            {column.label ?? column.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.data.rows.map((row) => (
                        <tr key={row.id} className="border-t">
                          {table.data.columns.map((column) => (
                            <td key={column.name} className="max-w-xs truncate px-2 py-1.5">
                              {row.data[column.name] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {table.data.truncated ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      Showing the first 200 rows.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No rows yet. Filling runs in the background; this list refreshes automatically.
                </p>
              )
            ) : null
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
