import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Agent Resources — Open-Connect" },
      {
        name: "description",
        content:
          "Browse skills, MCP servers, tools, plugins, agents, prompts and guides in the Open-Connect resource registry.",
      },
      { property: "og:title", content: "Agent Resources — Open-Connect" },
      {
        property: "og:description",
        content: "One normalized registry for every AI agent resource, searchable in one place.",
      },
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
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select(
          "id, slug, name, description, resource_type, category_slug, author, version, license, verified, featured, supported_clients",
        )
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
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
      <h1 className="text-3xl font-semibold sm:text-4xl">Agent Resources</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Skills, MCP servers, tools, plugins, agents, prompts and guides — one registry, one search.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search resources…"
            className="pl-9"
            aria-label="Search resources"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
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
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="uppercase">
                      {item.resource_type}
                    </Badge>
                    {item.verified ? (
                      <Badge variant="outline" className="border-accent/50 text-accent">
                        Verified
                      </Badge>
                    ) : null}
                  </div>
                  <CardTitle className="mt-3 text-base">{item.name}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">v{item.version}</span>
                  <span>{item.license}</span>
                  {item.category_slug ? <span>{item.category_slug}</span> : null}
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
