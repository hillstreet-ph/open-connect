import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderPlus, FolderOpen, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { listProjects } from "@/lib/orgs.functions";
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
  const listCollections = useServerFn(listResourceCollections);
  const createCollection = useServerFn(createResourceCollection);
  const addToCollection = useServerFn(addResourcesToCollection);
  const removeFromCollection = useServerFn(removeResourceFromCollection);
  const deleteCollection = useServerFn(deleteResourceCollection);
  const assign = useServerFn(assignResourcesToProjects);
  const list = useServerFn(listProjects);
  const collections = useQuery({
    queryKey: ["resource-collections"],
    queryFn: () => listCollections({}),
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => list({}) });
  const [name, setName] = useState("");
  const [targetCollection, setTargetCollection] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [assigningCollection, setAssigningCollection] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["resource-collections"] });
    void qc.invalidateQueries({ queryKey: ["project-resources"] });
    void qc.invalidateQueries({ queryKey: ["toolkits"] });
  };
  const createMutation = useMutation({
    mutationFn: () => createCollection({ data: { name, resourceIds: selectedResourceIds } }),
    onSuccess: () => {
      toast.success("Collection created");
      setName("");
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
    onSuccess: () => {
      toast.success("Resources added to collection");
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
    onSuccess: () => {
      toast.success("Resources assigned to selected projects");
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
        <Button
          disabled={!name.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <FolderPlus className="mr-2 size-4" />
          Create collection
        </Button>
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
            {(collections.data ?? []).map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
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
