import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getResourceDownloadUrl } from "@/lib/resources.functions";
import { resourceCategories } from "@/lib/nav";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Marketplace — Open-Connect" },
      {
        name: "description",
        content:
          "Marketplace for skills, MCP servers, tools, plugins, agents, prompts and guides.",
      },
      { property: "og:title", content: "Marketplace — Open-Connect" },
    ],
  }),
  component: ResourcesPage,
});

function ResourcesPage() {
  const { user } = useAuth();
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");
  const downloadFn = useServerFn(getResourceDownloadUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select(
          "id, slug, name, description, resource_type, category_slug, author, version, license, verified, featured, supported_clients, package_path, package_filename, package_size",
        )
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadFn({ data: { id } }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Download started");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Sign in required to download packages"),
  });

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      const matchesType = type === "all" || item.resource_type === type;
      const matchesTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.description ?? "").toLowerCase().includes(term) ||
        item.slug.toLowerCase().includes(term);
      return matchesType && matchesTerm;
    });
  }, [data, query, type]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: data?.length ?? 0 };
    for (const item of data ?? []) {
      map[item.resource_type] = (map[item.resource_type] ?? 0) + 1;
    }
    return map;
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
            Catalog · Resources
          </Badge>
          <h1 className="text-2xl font-semibold sm:text-4xl">Marketplace</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Skills, MCP, tools, plugins, agents, prompts, guides. Download when signed in; upload from
            the dashboard.
          </p>
        </div>
        {user ? (
          <Button asChild className="w-full shrink-0 sm:w-auto">
            <Link to="/dashboard">
              <Upload className="mr-2 size-4" />
              Upload
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
            <Link to="/auth">Sign in to upload</Link>
          </Button>
        )}
      </div>

      <div className="mt-8 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            className="pl-9"
            aria-label="Search marketplace"
          />
        </div>
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

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-xl" />
            ))
          : results.map((item) => (
              <Card key={item.id} className="shadow-panel">
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {item.resource_type}
                    </Badge>
                    {item.verified ? (
                      <Badge variant="outline" className="border-accent/50 text-[10px] text-accent">
                        Verified
                      </Badge>
                    ) : null}
                  </div>
                  <CardTitle className="mt-2 text-base leading-snug">{item.name}</CardTitle>
                  <CardDescription className="line-clamp-2">{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 pt-0 text-xs text-muted-foreground">
                  <span className="font-mono">v{item.version}</span>
                  {item.package_path ? (
                    user ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadMutation.mutate(item.id)}
                        disabled={downloadMutation.isPending}
                      >
                        <Download className="mr-1 size-3.5" />
                        Download
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/auth">Sign in</Link>
                      </Button>
                    )
                  ) : (
                    <span>Catalog</span>
                  )}
                </CardContent>
              </Card>
            ))}
      </div>

      {!isLoading && results.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">No matches in this category.</p>
      ) : null}
    </div>
  );
}
