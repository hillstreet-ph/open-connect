import { useState } from "react";
import { Input } from "@/components/ui/input";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteToolkit, listToolkits } from "@/lib/toolkits.functions";
import { AddToolkitToProject } from "@/components/add-toolkit-to-project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InstalledResourceSection } from "@/components/installed-resource-section";

export const Route = createFileRoute("/_authenticated/toolkits")({
  head: () => ({
    meta: [
      { title: "Toolkits — Open-Connect" },
      { name: "description", content: "Your reusable capability Toolkits." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ToolkitsPage,
});

function ToolkitsPage() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const list = useServerFn(listToolkits);
  const remove = useServerFn(deleteToolkit);
  const toolkits = useQuery({ queryKey: ["toolkits"], queryFn: () => list({}) });
  const mutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      toast.success("Toolkit deleted");
      void qc.invalidateQueries({ queryKey: ["toolkits"] });
    },
  });
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-5">
      <div>
        <h1 className="text-xl font-semibold">Toolkits</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          All Toolkits created in Studio or added from Marketplace. Add each bundle to projects
          without duplicating its capabilities.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Create and publish new Toolkits in{" "}
          <Link to="/studio" hash="toolkit-create" className="text-primary hover:underline">
            Studio
          </Link>
          .
        </p>
      </div>
      <Input
        aria-label="Search toolkits"
        placeholder="Search toolkits…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="h-9 max-w-xs"
      />
      <InstalledResourceSection resourceType="toolkit" search={search} />
      {toolkits.isLoading ? <p role="status">Loading toolkits…</p> : null}
      {toolkits.isError ? (
        <p role="alert">
          Could not load toolkits.{" "}
          <Button variant="link" onClick={() => void toolkits.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {(toolkits.data ?? [])
          .filter((toolkit) =>
            `${toolkit.name} ${toolkit.description ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase().trim()),
          )
          .map((toolkit) => (
            <Card key={toolkit.id} className="shadow-panel">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">{toolkit.name}</CardTitle>
                <CardDescription>{toolkit.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="flex flex-wrap gap-1">
                  {toolkit.toolkit_items?.map((item) => (
                    <Badge key={item.id} variant="secondary">
                      {item.resources?.name}
                    </Badge>
                  ))}
                </div>
                <AddToolkitToProject toolkitId={toolkit.id} />
                <Button
                  className="mt-2"
                  size="sm"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete toolkit ${toolkit.name}?`))
                      mutation.mutate(toolkit.id);
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </CardContent>
            </Card>
          ))}
      </div>
      {!toolkits.isLoading && !toolkits.isError && !toolkits.data?.length ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No custom bundles yet. Create a bundle in Studio.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
