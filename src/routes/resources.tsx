import { canDownloadResource, resourceReviewState } from "@/lib/resource-approval";
import { migratedResourceDownload } from "@/lib/migrated-resource-download";
import migratedPackages from "../../config/resource-migration.downloads.json";
import {
  groupResourcesByPurpose,
  resourceCategoryForType,
  resourcePurpose,
} from "@/lib/resource-categories";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, ExternalLink, Eye, Library, Loader2, Lock, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getResourceDownloadUrl, getResourceView } from "@/lib/resources.functions";
import { resourceCategories } from "@/lib/nav";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AddToLibraryButton } from "@/components/add-to-library";
import {
  addResourcesToLibrary,
  listLibraryResources,
  listResourceProjectAssignments,
} from "@/lib/library.functions";
import { listResourceCollections } from "@/lib/resource-collections.functions";
import {
  resolveDefaultMarketplaceCollection,
  setDefaultMarketplaceCollection,
} from "@/lib/resource-library-preferences";
import { ResourcePurposeSidebar } from "@/components/resource-purpose-sidebar";

export const Route = createFileRoute("/resources")({
  validateSearch: (search: Record<string, unknown>): { resource?: string } =>
    typeof search["resource"] === "string" ? { resource: search["resource"].slice(0, 160) } : {},
  head: () => ({
    meta: [
      { title: "Marketplace — Open-Connect" },
      {
        name: "description",
        content:
          "Marketplace for skills, MCP servers, tools, plugins, agents, prompts, and more. Sign in to download or add packages to your library.",
      },
      { property: "og:title", content: "Marketplace — Open-Connect" },
    ],
  }),
  component: ResourcesPage,
});

function triggerBlobDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ResourcesPage() {
  const { user } = useAuth();
  const { resource } = Route.useSearch();
  return user ? (
    <WorkspaceShell>
      <MarketplaceContent key={resource ?? "all"} />
    </WorkspaceShell>
  ) : (
    <MarketplaceContent key={resource ?? "all"} />
  );
}

function MarketplaceContent() {
  const { user } = useAuth();
  const [type, setType] = useState<string>("all");
  const { resource: linkedResource } = Route.useSearch();
  const [query, setQuery] = useState(linkedResource ?? "");
  const [purpose, setPurpose] = useState("all");
  const [viewText, setViewText] = useState<string | null>(null);
  const [viewTitle, setViewTitle] = useState("");
  const downloadFn = useServerFn(getResourceDownloadUrl);
  const viewFn = useServerFn(getResourceView);
  const listLibrary = useServerFn(listLibraryResources);
  const listCollections = useServerFn(listResourceCollections);
  const listAssignments = useServerFn(listResourceProjectAssignments);
  const addManyFn = useServerFn(addResourcesToLibrary);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const library = useQuery({
    queryKey: ["resource-library"],
    queryFn: () => listLibrary({ data: {} }),
    enabled: !!user,
  });
  const collections = useQuery({
    queryKey: ["resource-collections"],
    queryFn: () => listCollections({}),
    enabled: !!user,
  });
  const assignments = useQuery({
    queryKey: ["resource-project-assignments"],
    queryFn: () => listAssignments({}),
    enabled: !!user,
  });
  const [defaultCollectionOverride, setDefaultCollectionOverride] = useState<string | null>(null);
  const defaultCollectionId =
    defaultCollectionOverride ??
    resolveDefaultMarketplaceCollection(
      user?.id,
      collections.data?.map(({ id, name }) => ({ id, name })),
      defaultCollectionOverride,
    );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["resources-marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select(
          "id, slug, name, description, resource_type, category_slug, author, version, license, verified, featured, supported_clients, package_path, package_filename, package_size, installation_type, installation_config, source_url",
        )
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []).filter(
        (item) => !["guide", "app", "model", "memory", "knowledge"].includes(item.resource_type),
      );
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.kind === "url" && "url" in result && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else if (result.kind === "markdown" && "content" in result && result.content) {
        triggerBlobDownload(
          result.filename,
          result.content,
          result.mime ?? "text/markdown;charset=utf-8",
        );
      }
      toast.success("Download started");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Sign in required to download packages"),
  });

  const viewMutation = useMutation({
    mutationFn: (id: string) => viewFn({ data: { id } }),
    onSuccess: (result) => {
      setViewTitle(result.name);
      setViewText(result.manifest);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not load skill"),
  });

  const purposes = groupResourcesByPurpose(
    (data ?? []).map((resources) => ({ id: resources.id, resources })),
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      const matchesType = type === "all" || resourceCategoryForType(item.resource_type) === type;
      const matchesTerm =
        linkedResource && query === linkedResource
          ? item.slug === linkedResource
          : !term ||
            item.name.toLowerCase().includes(term) ||
            (item.description ?? "").toLowerCase().includes(term) ||
            item.slug.toLowerCase().includes(term);
      return (
        matchesType &&
        matchesTerm &&
        (purpose === "all" || resourcePurpose({ id: item.id, resources: item }) === purpose)
      );
    });
  }, [data, query, type, purpose, linkedResource]);

  const libraryIds = useMemo(
    () =>
      new Set(
        (library.data ?? [])
          .map((row) => row.resources?.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    [library.data],
  );
  const selectableIds = useMemo(
    () => results.filter((item) => !libraryIds.has(item.id)).map((item) => item.id),
    [results, libraryIds],
  );
  const selectedIds = useMemo(
    () => [...selected].filter((id) => !libraryIds.has(id)),
    [selected, libraryIds],
  );
  const shownSelected = selectableIds.filter((id) => selected.has(id)).length;
  const allShownSelected = selectableIds.length > 0 && shownSelected === selectableIds.length;
  const toggleSelected = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAllShown = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of selectableIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const addMany = useMutation({
    mutationFn: (resourceIds: string[]) =>
      addManyFn({ data: { resourceIds, collectionId: defaultCollectionId || null } }),
    onSuccess: (result) => {
      const notes = [
        result.already_in_library ? `${result.already_in_library} already in Library` : "",
        result.missing ? `${result.missing} unavailable` : "",
        result.collection_full ? `${result.collection_full} not added to the full collection` : "",
      ].filter(Boolean);
      toast.success(
        `Added ${result.added} of ${result.requested} to your Library` +
          (notes.length ? ` (${notes.join(", ")})` : ""),
      );
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["resource-library"] });
      void queryClient.invalidateQueries({ queryKey: ["project-resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resource-collections"] });
      void queryClient.invalidateQueries({ queryKey: ["resource-project-assignments"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add to library"),
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: data?.length ?? 0 };
    for (const item of data ?? []) {
      map[item.resource_type] = (map[item.resource_type] ?? 0) + 1;
    }
    return map;
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
            Public catalog · Packages
          </Badge>
          <h1 className="text-xl font-semibold">Marketplace</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Browse skills, tools, agents, MCP servers, and more. Install packages to your personal
            Library. Project assignment is optional.
          </p>
        </div>
        {!user ? (
          <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
            <Link to="/auth">
              <Lock className="mr-2 size-4" />
              Sign in to download
            </Link>
          </Button>
        ) : null}
      </div>

      {!user ? (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Browse freely while logged out. Sign in to view, download, or add packages to your
            library.
          </span>
        </div>
      ) : null}

      {user ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Add new Marketplace items to</p>
            <p className="text-xs text-muted-foreground">
              Skills are automatically added to your Library and Skills collection. Other resource
              types follow the optional default collection. Projects are never assigned
              automatically.
            </p>
          </div>
          <select
            aria-label="Default collection for Marketplace installs"
            className="h-9 min-w-48 rounded-md border bg-background px-3 text-sm"
            value={defaultCollectionId}
            onChange={(event) => {
              const id = event.target.value;
              setDefaultCollectionOverride(id);
              if (user.id) setDefaultMarketplaceCollection(user.id, id);
            }}
          >
            <option value="">Library only</option>
            {(collections.data ?? []).map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <ResourcePurposeSidebar
          groups={purposes}
          activePurpose={purpose}
          allCount={data?.length ?? 0}
          onSelect={setPurpose}
          ariaLabel="Marketplace purpose categories"
        />
        <div className="min-w-0 space-y-4">
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search packages…"
                className="pl-9"
                aria-label="Search marketplace"
              />
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {resourceCategories.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={type === filter.value}
                  onClick={() => setType(filter.value)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    type === filter.value
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

          {user && !isLoading && !isError ? (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-2 backdrop-blur">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allShownSelected ? true : shownSelected > 0 ? "indeterminate" : false}
                  onCheckedChange={(value) => toggleAllShown(value === true)}
                  disabled={!selectableIds.length || addMany.isPending}
                  aria-label="Select all shown resources not yet in your Library"
                />
                Select all ({selectableIds.length})
              </label>
              <span className="text-xs text-muted-foreground" role="status">
                {selectedIds.length} selected
              </span>
              {selectedIds.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                  disabled={addMany.isPending}
                >
                  <X className="mr-1 size-3.5" />
                  Clear
                </Button>
              ) : null}
              <Button
                size="sm"
                className="ml-auto"
                disabled={!selectedIds.length || addMany.isPending}
                onClick={() => addMany.mutate(selectedIds)}
              >
                {addMany.isPending ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <Library className="mr-1 size-3.5" />
                )}
                Add selected to Library{selectedIds.length ? ` (${selectedIds.length})` : ""}
              </Button>
            </div>
          ) : null}

          {isError ? (
            <p role="alert">
              Could not load Marketplace.{" "}
              <Button variant="link" onClick={() => void refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          {!isLoading && !isError && results.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              No resources match your filters.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-36 rounded-xl" />
                ))
              : results.map((item) => {
                  const config =
                    item.installation_config && typeof item.installation_config === "object"
                      ? (item.installation_config as Record<string, unknown>)
                      : {};
                  const reviewState = resourceReviewState(item);
                  const canonicalUrl =
                    typeof config["canonical_url"] === "string" ? config["canonical_url"] : null;
                  const publicItem = { ...item, published: true };
                  const migrated =
                    !item.package_path && migratedResourceDownload(publicItem, migratedPackages);
                  const executable = canDownloadResource(publicItem, "", Boolean(migrated));
                  const inLibrary = libraryIds.has(item.id);
                  const collectionNames = (collections.data ?? [])
                    .filter((collection) =>
                      collection.toolkit_items.some((entry) => entry.resource_id === item.id),
                    )
                    .map((collection) => collection.name);
                  const projectNames = [
                    ...new Set(
                      (assignments.data ?? [])
                        .filter((assignment) => assignment.resourceId === item.id)
                        .map((assignment) => assignment.projectName),
                    ),
                  ];
                  return (
                    <Card key={item.id} className="shadow-panel">
                      <CardHeader className="p-3 pb-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {user && !inLibrary ? (
                            <Checkbox
                              checked={selected.has(item.id)}
                              onCheckedChange={(value) => toggleSelected(item.id, value === true)}
                              disabled={addMany.isPending}
                              aria-label={`Select ${item.name}`}
                            />
                          ) : null}
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            {item.resource_type}
                          </Badge>
                          {executable ? (
                            <Badge
                              variant="outline"
                              className="border-accent/50 text-[10px] text-accent"
                            >
                              Verified
                            </Badge>
                          ) : null}
                          {!executable ? (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {reviewState.replaceAll("_", " ")}
                            </Badge>
                          ) : null}
                        </div>
                        {inLibrary || collectionNames.length > 0 || projectNames.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline" className="border-primary/50 text-primary">
                              In Library
                            </Badge>
                            {collectionNames.map((name) => (
                              <Badge key={name} variant="secondary">
                                {name}
                              </Badge>
                            ))}
                            {projectNames.map((name) => (
                              <Badge key={name} variant="outline">
                                Project: {name}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        <CardTitle className="mt-1 text-sm leading-snug">{item.name}</CardTitle>
                        <CardDescription className="line-clamp-2 text-xs">
                          {item.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 pt-1 text-xs text-muted-foreground">
                        <span className="font-mono">v{item.version}</span>
                        {user ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex gap-1">
                              {canonicalUrl ? (
                                <Button asChild size="sm" variant="ghost">
                                  <a href={canonicalUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-1 size-3.5" />
                                    Source
                                  </a>
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => viewMutation.mutate(item.id)}
                                disabled={viewMutation.isPending}
                              >
                                <Eye className="mr-1 size-3.5" />
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadMutation.mutate(item.id)}
                                disabled={downloadMutation.isPending}
                                title={
                                  executable ? undefined : "Metadata only until review is approved"
                                }
                              >
                                <Download className="mr-1 size-3.5" />
                                {executable ? "Download" : "Metadata"}
                              </Button>
                            </div>
                            <AddToLibraryButton
                              resourceId={item.id}
                              collectionId={defaultCollectionId || undefined}
                              resourceType={item.resource_type}
                              alreadyInLibrary={inLibrary}
                              metadataOnly={!executable}
                            />
                          </div>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link to="/auth">
                              <Lock className="mr-1 size-3.5" />
                              Sign in
                            </Link>
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
          </div>
        </div>
      </div>

      {viewText ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <Card className="max-h-[85vh] w-full max-w-2xl overflow-hidden shadow-panel">
            <CardHeader className="flex flex-row items-start justify-between gap-2 p-4">
              <div>
                <CardTitle className="text-base">{viewTitle}</CardTitle>
                <CardDescription>Skill manifest (signed-in view)</CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setViewText(null)}>
                Close
              </Button>
            </CardHeader>
            <CardContent className="max-h-[60vh] overflow-auto p-4 pt-0">
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-xs">
                {viewText}
              </pre>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
