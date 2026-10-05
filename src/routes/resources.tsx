import {
  groupResourcesByPurpose,
  resourceCategoryForType,
  resourcePurpose,
} from "@/lib/resource-categories";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, ExternalLink, Eye, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getResourceDownloadUrl, getResourceView } from "@/lib/resources.functions";
import { resourceCategories } from "@/lib/nav";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AddToLibraryButton } from "@/components/add-to-library";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Marketplace — Open-Connect" },
      {
        name: "description",
        content:
          "Marketplace for guides, skills, MCP servers, tools, plugins, agents and prompts. Sign in to download or add to a project.",
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
  return user ? (
    <WorkspaceShell>
      <MarketplaceContent />
    </WorkspaceShell>
  ) : (
    <MarketplaceContent />
  );
}

function MarketplaceContent() {
  const { user } = useAuth();
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState("all");
  const [viewText, setViewText] = useState<string | null>(null);
  const [viewTitle, setViewTitle] = useState("");
  const downloadFn = useServerFn(getResourceDownloadUrl);
  const viewFn = useServerFn(getResourceView);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["resources-marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select(
          "id, slug, name, description, resource_type, category_slug, author, version, license, verified, featured, supported_clients, package_path, package_filename, package_size, installation_type, installation_config",
        )
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
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
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.description ?? "").toLowerCase().includes(term) ||
        item.slug.toLowerCase().includes(term);
      return (
        matchesType &&
        matchesTerm &&
        (purpose === "all" || resourcePurpose({ id: item.id, resources: item }) === purpose)
      );
    });
  }, [data, query, type, purpose]);

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
            Browse guides, skills, MCP, tools, plugins, agents, and prompts. Add packages to your
            personal library, then share them with projects from the matching sidebar page.
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

      <div className="mt-8 space-y-3">
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
        <select
          aria-label="Marketplace purpose category"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
        >
          <option value="all">All categories</option>
          {purposes.map((group) => (
            <option key={group.type} value={group.type}>
              {group.label} ({group.items.length})
            </option>
          ))}
        </select>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {resourceCategories.map((filter) => (
            <button
              key={filter.value}
              type="button"
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

      {isError ? (
        <p role="alert" className="mt-4">
          Could not load Marketplace.{" "}
          <Button variant="link" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
      {!isLoading && !isError && results.length === 0 ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          No resources match your filters.
        </p>
      ) : null}
      <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-xl" />
            ))
          : results.map((item) => {
              const config =
                item.installation_config && typeof item.installation_config === "object"
                  ? (item.installation_config as Record<string, unknown>)
                  : {};
              const reviewState = String(config["review_state"] ?? "approved");
              const canonicalUrl =
                typeof config["canonical_url"] === "string" ? config["canonical_url"] : null;
              const executable = item.verified && reviewState === "approved";
              return (
                <Card key={item.id} className="shadow-panel">
                  <CardHeader className="p-3 pb-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {item.resource_type}
                      </Badge>
                      {item.verified ? (
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
                        {executable ? <AddToLibraryButton resourceId={item.id} /> : null}
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
