import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listLibraryResources, removeResourceFromLibrary } from "@/lib/library.functions";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { groupProjectResources } from "@/lib/resource-categories";
import { isSharedLibraryRow } from "@/lib/shared-resources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResourceLibraryPage({
  resourceType,
  title,
  description,
}: {
  resourceType?: "agent" | "skill" | "prompt" | "plugin" | "mcp" | "tool";
  title: string;
  description: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const list = useServerFn(listLibraryResources);
  const remove = useServerFn(removeResourceFromLibrary);
  const resources = useQuery({
    queryKey: ["resource-library", resourceType],
    queryFn: () => list({ data: resourceType ? { resourceType } : {} }),
  });
  const removeMutation = useMutation({
    mutationFn: (resourceId: string) => remove({ data: { resourceId } }),
    onSuccess: () => {
      toast.success("Removed from your library");
      void qc.invalidateQueries({ queryKey: ["resource-library"] });
      void qc.invalidateQueries({ queryKey: ["project-resources"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = resources.data ?? [];
  const categories = groupProjectResources(rows);
  const filtered = rows.filter((row) => {
    const resource = row.resources;
    return (
      resource &&
      (category === "all" ||
        resource.resource_type === category ||
        (category === "other" &&
          !categories.some((group) => group.type === resource.resource_type))) &&
      `${resource.name} ${resource.description ?? ""} ${resource.resource_type}`
        .toLowerCase()
        .includes(search.toLowerCase().trim())
    );
  });
  const groups = groupProjectResources(filtered);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
          <Boxes className="mr-1 size-3" /> HillStreet workspace library
        </Badge>
        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Upload and publish new packages in Studio. Add existing packages from Marketplace.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search installed resources"
          placeholder="Search installed resources…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        {!resourceType ? (
          <select
            aria-label="Resource category"
            className="rounded-md border bg-background p-2 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories ({rows.length})</option>
            {categories.map((group) => (
              <option key={group.type} value={group.type}>
                {group.label} ({group.items.length})
              </option>
            ))}
          </select>
        ) : null}
        <Button asChild variant="outline">
          <Link to="/resources">Browse Marketplace</Link>
        </Button>
      </div>
      {resources.isLoading ? <p role="status">Loading installed resources…</p> : null}
      {groups.map((group) => (
        <section key={group.type} className="space-y-3" aria-label={group.label}>
          <h2 className="text-base font-semibold">
            {group.label} <span className="text-muted-foreground">({group.items.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((row) => {
              const resource = row.resources!;
              return (
                <Card key={resource.id} className="shadow-panel">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base">{resource.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {resource.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2 p-4 pt-2">
                    <Badge variant="secondary">
                      {isSharedLibraryRow(row) ? "All projects" : "Private context"}
                    </Badge>
                    {!row.id.startsWith("owned-") ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={removeMutation.isPending}
                        aria-label={`Remove ${resource.name} from workspace library`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${resource.name} from the shared workspace library?`,
                            )
                          )
                            removeMutation.mutate(resource.id!);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {resources.isError ? (
        <p role="alert">Could not load your library. Please try again.</p>
      ) : null}
      {!resources.isLoading && !resources.isError && filtered.length === 0 ? (
        <Card className="shadow-panel">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {rows.length
              ? "No resources match your search."
              : "No resources installed yet. Add resources from Marketplace or Studio."}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
