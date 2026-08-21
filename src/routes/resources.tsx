import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getResourceDownloadUrl } from "@/lib/resources.functions";
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

const filters = [
  { value: "all", label: "All" },
  { value: "skill", label: "Skills" },
  { value: "mcp", label: "MCP" },
  { value: "tool", label: "Tools" },
  { value: "plugin", label: "Plugins" },
  { value: "agent", label: "Agents" },
  { value: "prompt", label: "Prompts" },
  { value: "guide", label: "Guides" },
] as const;

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
            Marketplace
          </Badge>
          <h1 className="text-3xl font-semibold sm:text-4xl">Agent resources</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Public marketplace of skills, MCP servers, tools, plugins, agents, prompts and guides.
            Download packages when signed in. Upload only from the app dashboard after login.
          </p>
        </div>
        {user ? (
          <Button asChild>
            <Link to="/dashboard">
              <Upload className="mr-2 size-4" />
              Upload package
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/auth">
              <Upload className="mr-2 size-4" />
              Sign in to upload
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search marketplace…"
            className="pl-9"
            aria-label="Search marketplace"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setType(filter.value)}
              className={cn(
                "rounded-full border border-border/70 px-3 py-1.5 text-xs transition-colors",
                type === filter.value
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-xl" />
            ))
          : results.map((item) => (
              <Card key={item.id} className="shadow-panel">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="uppercase">
                      {item.resource_type}
                    </Badge>
                    {item.verified ? (
                      <Badge variant="outline" className="border-accent/50 text-accent">
                        Verified
                      </Badge>
                    ) : null}
                    {item.package_path ? (
                      <Badge variant="outline" className="text-xs">
                        Package
                      </Badge>
                    ) : null}
                  </div>
                  <CardTitle className="mt-3 text-base">{item.name}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-mono">v{item.version}</span>
                    <span>{item.license}</span>
                    {item.category_slug ? <span>{item.category_slug}</span> : null}
                  </div>
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
                        <Link to="/auth">Sign in to download</Link>
                      </Button>
                    )
                  ) : (
                    <span className="text-muted-foreground">Catalog entry</span>
                  )}
                </CardContent>
              </Card>
            ))}
      </div>

      {!isLoading && results.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          No resources match that search yet.
        </p>
      ) : null}
    </div>
  );
}
