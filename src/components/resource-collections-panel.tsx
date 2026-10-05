import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderPlus, FolderOpen, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { listAssignableProjects } from "@/lib/resource-collections.functions";
import { listResourceProjectAssignments } from "@/lib/library.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  getDefaultMarketplaceCollection,
  setDefaultMarketplaceCollection,
} from "@/lib/resource-library-preferences";
import {
  addResourcesToCollection,
  assignResourcesToProjects,
  createResourceCollection,
  deleteResourceCollection,
  listResourceCollections,
  removeResourceFromCollection,
} from "@/lib/resource-collections.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ResourceCollectionsPanel({
  selectedResourceIds,
  onClearSelection,
}: {
  selectedResourceIds: string[];
  onClearSelection: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const listCollections = useServerFn(listResourceCollections);
  const createCollection = useServerFn(createResourceCollection);
  const addToCollection = useServerFn(addResourcesToCollection);
  const removeFromCollection = useServerFn(removeResourceFromCollection);
  const deleteCollection = useServerFn(deleteResourceCollection);
  const assign = useServerFn(assignResourcesToProjects);
  const list = useServerFn(listAssignableProjects);
  const listAssignments = useServerFn(listResourceProjectAssignments);
  const collections = useQuery({
    queryKey: ["resource-collections"],
    queryFn: () => listCollections({}),
  });
  const projects = useQuery({ queryKey: ["assignable-projects"], queryFn: () => list({}) });
  const assignments = useQuery({
    queryKey: ["resource-project-assignments"],
    queryFn: () => listAssignments({}),
  });
  const [name, setName] = useState("");
  const [targetCollection, setTargetCollection] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [assigningCollection, setAssigningCollection] = useState<string | null>(null);
  const [defaultCollectionId, setDefaultCollectionId] = useState("");
  const [createAsDefault, setCreateAsDefault] = useState(false);

  useEffect(() => {
    if (!user?.id || !collections.data) return;
    const valid = new Set(collections.data.map((collection) => collection.id));
    const saved = getDefaultMarketplaceCollection(user.id);
    if (saved && valid.has(saved)) {
      setDefaultCollectionId(saved);
      return;
    }
    const kobeplay = collections.data.find(
      (collection) => collection.name.trim().toLowerCase() === "kobeplay",
    );
    const fallback = kobeplay?.id ?? "";
    setDefaultCollectionId(fallback);
    setDefaultMarketplaceCollection(user.id, fallback);
  }, [user?.id, collections.data]);

  function chooseDefaultCollection(collectionId: string) {
    setDefaultCollectionId(collectionId);
    if (user?.id) setDefaultMarketplaceCollection(user.id, collectionId);
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["resource-collections"] });
    void qc.invalidateQueries({ queryKey: ["project-resources"] });
    void qc.invalidateQueries({ queryKey: ["toolkits"] });
    void qc.invalidateQueries({ queryKey: ["resource-project-assignments"] });
  };
  const createMutation = useMutation({
    mutationFn: () => createCollection({ data: { name, resourceIds: selectedResourceIds } }),
    onSuccess: (result) => {
      toast.success("Collection created");
      setName("");
      if (createAsDefault && user?.id) {
        chooseDefaultCollection(result.id);
        setCreateAsDefault(false);
      }
      onClearSelection();
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const addMutation = useMutation({
    mutationFn: () =>
      addToCollection({
        data: { collectionId: targetCollection, resourceIds: selectedResourceIds },
      }),
    onSuccess: (result) => {
      toast.success(
        result.skipped
          ? `${result.added} added; ${result.skipped} already in this collection`
          : "Resources added to collection",
      );
      setTargetCollection("");
      onClearSelection();
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const removeMutation = useMutation({
    mutationFn: ({ collectionId, resourceId }: { collectionId: string; resourceId: string }) =>
      removeFromCollection({ data: { collectionId, resourceId } }),
    onSuccess: () => {
      toast.success("Resource removed from collection");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (collectionId: string) => deleteCollection({ data: { collectionId } }),
    onSuccess: () => {
      toast.success("Collection deleted");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const assignMutation = useMutation({
    mutationFn: (resourceIds: string[]) =>
      assign({ data: { resourceIds, projectIds: selectedProjects } }),
    onSuccess: (result) => {
      toast.success(
        result.skipped
          ? `${result.assigned} new assignments; ${result.skipped} already assigned`
          : "Resources assigned to selected projects",
      );
      setSelectedProjects([]);
      setAssigningCollection(null);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  function toggleProject(projectId: string) {
    setSelectedProjects((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <label htmlFor="default-marketplace-collection" className="text-sm font-medium">
          Default collection for Marketplace
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          New Marketplace installs go to Library and this collection. Existing items are marked as already added.
        </p>
        <select
          id="default-marketplace-collection"
          aria-label="Default collection for Marketplace"
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
          value={defaultCollectionId}
          onChange={(event) => chooseDefaultCollection(event.target.value)}
        >
          <option value="">Library only</option>
          {(collections.data ?? []).map((collection) => (
            <option key={collection.id} value={collection.id}>{collection.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor="resource-collection-name" className="text-sm font-medium">
            New collection
          </label>
          <Input
            id="resource-collection-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Support workflow"
            maxLength={80}
          />
          <p className="text-xs text-muted-foreground">
            {selectedResourceIds.length
              ? `${selectedResourceIds.length} selected resources will be added.`
              : "Create an empty folder, then add resources from your Library."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={createAsDefault}
              onChange={(event) => setCreateAsDefault(event.target.checked)}
              className="size-4 accent-primary"
            />
            Make this the Marketplace default
          </label>
          <Button
            disabled={!name.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <FolderPlus className="mr-2 size-4" />
            Create collection
          </Button>
        </div>
      </div>

      {selectedResourceIds.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
          <Badge variant="secondary">{selectedResourceIds.length} selected</Badge>
          <select
            aria-label="Choose collection"
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
            value={targetCollection}
            onChange={(event) => setTargetCollection(event.target.value)}
          >
            <option value="">Add selected to collection…</option>
            {(collections.data ?? []).map((collection) => {
              const alreadyHasAll = selectedResourceIds.every((id) =>
                collection.toolkit_items.some((item) => item.resource_id === id),
              );
              return (
                <option key={collection.id} value={collection.id} disabled={alreadyHasAll}>
                  {collection.name}
                  {collection.id === defaultCollectionId ? " (Marketplace default)" : ""}
                  {alreadyHasAll ? " (already added)" : ""}
                </option>
              );
            })}
          </select>
          <Button
            variant="outline"
            disabled={!targetCollection || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            Add selected
          </Button>
          <Button variant="ghost" onClick={onClearSelection}>
            Clear selection
          </Button>
        </div>
      ) : null}

      <section className="space-y-2" aria-label="Assign resources to projects">
        <div>
          <h2 className="text-sm font-semibold">Assign selected resources to projects</h2>
          <p className="text-xs text-muted-foreground">
            Choose one or more projects. This assigns the selected resources or a whole collection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(projects.data ?? []).map((project) => (
            <label
              key={project.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
            >
              <input
                type="checkbox"
                checked={selectedProjects.includes(project.id)}
                onChange={() => toggleProject(project.id)}
                className="size-4 accent-primary"
              />
              {project.name}
            </label>
          ))}
          {projects.isLoading ? (
            <span role="status" className="text-xs text-muted-foreground">
              Loading projects…
            </span>
          ) : null}
        </div>
        {selectedResourceIds.length > 0 ? (
          <Button
            size="sm"
            disabled={!selectedProjects.length || assignMutation.isPending}
            onClick={() => assignMutation.mutate(selectedResourceIds)}
          >
            Assign {selectedResourceIds.length} selected
          </Button>
        ) : null}
      </section>

      <section className="space-y-3" aria-label="Resource collections">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Collections</h2>
            <p className="text-xs text-muted-foreground">
              Group related resources into folders and assign a whole folder to selected projects.
            </p>
          </div>
          <Badge variant="secondary">{collections.data?.length ?? 0}</Badge>
        </div>
        {collections.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading collections…
          </p>
        ) : null}
        {collections.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load collections.
          </p>
        ) : null}
        {!collections.isLoading && !collections.isError && !collections.data?.length ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              No collections yet. Select resources in Library and create a folder here.
            </CardContent>
          </Card>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {(collections.data ?? []).map((collection) => {
            const resourceIds = collection.toolkit_items.map((item) => item.resource_id);
            const assignedProjectNames = new Set(
              (assignments.data ?? [])
                .filter((assignment) => resourceIds.includes(assignment.resourceId))
                .map((assignment) => assignment.projectName),
            );
            return (
              <Card key={collection.id} className="shadow-panel">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FolderOpen className="size-4 text-primary" />
                        <span className="truncate">{collection.name}</span>
                      </CardTitle>
                      <CardDescription>{collection.toolkit_items.length} resources</CardDescription>
                      {collection.id === defaultCollectionId ? (
                        <Badge variant="outline" className="mt-1 border-primary/50 text-primary">
                          Marketplace default
                        </Badge>
                      ) : null}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${collection.name}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete collection "${collection.name}"?`)) {
                          deleteMutation.mutate(collection.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-0">
                  <div className="flex flex-wrap gap-1">
                    {collection.toolkit_items.map((item) => (
                      <Badge key={item.id} variant="secondary" className="gap-1">
                        {item.resources?.name ?? "Resource"}
                        <button
                          type="button"
                          aria-label={`Remove ${item.resources?.name ?? "resource"} from ${collection.name}`}
                          onClick={() =>
                            removeMutation.mutate({
                              collectionId: collection.id,
                              resourceId: item.resource_id,
                            })
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                    {!collection.toolkit_items.length ? (
                      <p className="text-xs text-muted-foreground">This folder is empty.</p>
                    ) : null}
                  </div>
                  {assignedProjectNames.size ? (
                    <div className="flex flex-wrap gap-1" aria-label="Projects using this collection">
                      {[...assignedProjectNames].map((projectName) => (
                        <Badge key={projectName} variant="outline">Project: {projectName}</Badge>
                      ))}
                    </div>
                  ) : null}
                  {assigningCollection === collection.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={
                          !selectedProjects.length ||
                          !resourceIds.length ||
                          assignMutation.isPending
                        }
                        onClick={() => assignMutation.mutate(resourceIds)}
                      >
                        Assign folder ({resourceIds.length})
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAssigningCollection(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!resourceIds.length}
                      onClick={() => setAssigningCollection(collection.id)}
                    >
                      Assign folder to selected projects
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
