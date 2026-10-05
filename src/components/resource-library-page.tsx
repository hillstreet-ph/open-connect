import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listLibraryResources,
  listResourceProjectAssignments,
  removeResourceFromLibrary,
} from "@/lib/library.functions";
import { listResourceCollections } from "@/lib/resource-collections.functions";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import {
  groupResourcesByPurpose,
  groupResourcesByType,
  resourceCategoryForType,
  resourcePurpose,
} from "@/lib/resource-categories";
import { ResourcePurposeSidebar } from "@/components/resource-purpose-sidebar";
import { ResourceCollectionsPanel } from "@/components/resource-collections-panel";
import { resourceCategories } from "@/lib/nav";
import { isSharedLibraryRow } from "@/lib/shared-resources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MemoryKnowledgePage } from "@/routes/_authenticated/memory";

export function ResourceLibraryPage({
  resourceType,
  otherTypesOnly = false,
  title,
  description,
}: {
  resourceType?: "agent" | "skill" | "prompt" | "plugin" | "mcp" | "tool";
  otherTypesOnly?: boolean;
  title: string;
  description: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [purpose, setPurpose] = useState("all");
  const [view, setView] = useState<"library" | "collections" | "memory" | "knowledge">("library");
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const canManageCollections = !resourceType && !otherTypesOnly;
  const list = useServerFn(listLibraryResources);
  const remove = useServerFn(removeResourceFromLibrary);
  const listCollections = useServerFn(listResourceCollections);
  const listAssignments = useServerFn(listResourceProjectAssignments);
  const collections = useQuery({
    queryKey: ["resource-collections"],
    queryFn: () => listCollections({}),
    enabled: canManageCollections,
  });
  const assignments = useQuery({
    queryKey: ["resource-project-assignments"],
    queryFn: () => listAssignments({}),
  });
  const resources = useQuery({
    queryKey: ["resource-library", resourceType],
    queryFn: () => list({ data: resourceType ? { resourceType } : {} }),
  });
  const removeMutation = useMutation({
    mutationFn: (resourceId: string) => remove({ data: { resourceId } }),
    onSuccess: (_result, resourceId) => {
      setSelectedResourceIds((current) => current.filter((id) => id !== resourceId));
      toast.success("Removed from your library");
      void qc.invalidateQueries({ queryKey: ["resource-library"] });
      void qc.invalidateQueries({ queryKey: ["project-resources"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = (resources.data ?? []).filter((row) => {
    const type = row.resources?.resource_type ?? "";
    return (
      type !== "guide" &&
      (!otherTypesOnly ||
        ![
          "plugin",
          "agent",
          "skill",
          "mcp",
          "tool",
          "toolkit",
          "prompt",
          "memory",
          "knowledge",
        ].includes(type))
    );
  });
  const counts: Record<string, number> = {
    all: rows.filter((row) => row.resources).length,
  };
  for (const row of rows) {
    if (!row.resources) continue;
    const type = resourceCategoryForType(row.resources.resource_type);
    counts[type] = (counts[type] ?? 0) + 1;
  }

  const purposeGroups = groupResourcesByPurpose(rows);
  const filtered = rows.filter((row) => {
    const resource = row.resources;
    return (
      resource &&
      (category === "all" || resourceCategoryForType(resource.resource_type) === category) &&
      (purpose === "all" || resourcePurpose(row) === purpose) &&
      `${resource.name} ${resource.description ?? ""} ${resource.resource_type}`
        .toLowerCase()
        .includes(search.toLowerCase().trim())
    );
  });
  const groups = groupResourcesByType(filtered);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <div>
        <h1 className="font-display text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{description}</p>
      </div>

      {canManageCollections ? (
        <div
          role="tablist"
          aria-label="Resource library views"
          className="mt-4 flex gap-2 border-b border-border"
        >
          {(["library", "collections", "memory", "knowledge"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              onClick={() => setView(tab)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm capitalize transition-colors",
                view === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      ) : null}
      {canManageCollections && view === "collections" ? (
        <ResourceCollectionsPanel
          selectedResourceIds={selectedResourceIds}
          onClearSelection={() => setSelectedResourceIds([])}
        />
      ) : canManageCollections && view === "memory" ? (
        <MemoryKnowledgePage defaultSection="memory" />
      ) : canManageCollections && view === "knowledge" ? (
        <MemoryKnowledgePage defaultSection="knowledge" />
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
          <ResourcePurposeSidebar
            groups={purposeGroups}
            activePurpose={purpose}
            allCount={counts.all}
            onSelect={setPurpose}
            ariaLabel="Resource purpose categories"
          />
          <div className="min-w-0 space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Search resources"
                  placeholder="Search resources…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 max-w-xs text-sm"
                />
                <Button asChild size="sm" variant="outline">
                  <Link to="/resources">Browse Marketplace</Link>
                </Button>
              </div>
              <div
                role="group"
                aria-label="Filter resources by category"
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
              >
                {resourceCategories.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={category === filter.value}
                    onClick={() => setCategory(filter.value)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                      category === filter.value
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {filter.label}
                    {counts[filter.value] != null ? (
                      <span className="ml-1 opacity-60">{counts[filter.value]}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            {canManageCollections && selectedResourceIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">{selectedResourceIds.length} selected</span>
                <span className="text-xs text-muted-foreground">
                  Create a collection or assign these resources to projects.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => setView("collections")}
                >
                  Manage selection
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedResourceIds([])}>
                  Clear
                </Button>
              </div>
            ) : null}
            {resources.isLoading ? <p role="status">Loading resources…</p> : null}
            {groups.map((group) => (
              <section key={group.type} className="space-y-2" aria-label={group.label}>
                <h2 className="text-sm font-semibold">
                  {group.label}{" "}
                  <span className="text-muted-foreground">({group.items.length})</span>
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((row) => {
                    const resource = row.resources!;
                    const isSelected = selectedResourceIds.includes(resource.id);
                    const collectionNames = (collections.data ?? [])
                      .filter((collection) =>
                        collection.toolkit_items.some((item) => item.resource_id === resource.id),
                      )
                      .map((collection) => collection.name);
                    const projectNames = [
                      ...new Set(
                        (assignments.data ?? [])
                          .filter((assignment) => assignment.resourceId === resource.id)
                          .map((assignment) => assignment.projectName),
                      ),
                    ];
                    return (
                      <Card
                        key={resource.id}
                        className={cn("shadow-panel", isSelected && "border-primary")}
                      >
                        <CardHeader className="p-3 pb-1">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm leading-snug">{resource.name}</CardTitle>
                            {canManageCollections ? (
                              <input
                                type="checkbox"
                                aria-label={`Select ${resource.name}`}
                                checked={isSelected}
                                onChange={() =>
                                  setSelectedResourceIds((current) =>
                                    isSelected
                                      ? current.filter((id) => id !== resource.id)
                                      : [...current, resource.id],
                                  )
                                }
                                className="mt-0.5 size-4 shrink-0 accent-primary"
                              />
                            ) : null}
                          </div>
                          <CardDescription className="line-clamp-2 text-xs">
                            {resource.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center gap-1.5 p-3 pt-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {isSharedLibraryRow(row) ? "All projects" : "Private context"}
                          </Badge>
                          {collectionNames.map((name) => (
                            <Badge key={name} variant="outline" className="text-[10px]">
                              In {name}
                            </Badge>
                          ))}
                          {projectNames.map((name) => (
                            <Badge key={name} variant="outline" className="text-[10px]">
                              Project: {name}
                            </Badge>
                          ))}
                          {!resourceType ? (
                            <Badge variant="outline" className="text-[10px]">
                              {resource.resource_type}
                            </Badge>
                          ) : null}
                          {!row.id.startsWith("owned-") ? (
                            <Button
                              size="sm"
                              className="ml-auto size-8 p-0"
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
                    ? "No resources match your filters."
                    : "No resources installed yet. Add resources from Marketplace or Studio."}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
