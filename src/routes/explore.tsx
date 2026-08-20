import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore the Open-Connect Marketplace" },
      {
        name: "description",
        content:
          "Browse Skills, Apps, Models, MCP servers, Tools, Agents and Prompts in the Open-Connect marketplace and bundle them into a Toolkit.",
      },
      { property: "og:title", content: "Explore the Open-Connect Marketplace" },
      {
        property: "og:description",
        content: "Skills, Apps, Models, MCP, Tools, Agents and Prompts — one marketplace, one key.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExplorePage,
});

export const EXPLORE_TABS = [
  { value: "all", label: "All" },
  { value: "skill", label: "Skills" },
  { value: "app", label: "Apps" },
  { value: "model", label: "Models" },
  { value: "mcp", label: "MCP" },
  { value: "tool", label: "Tools" },
  { value: "agent", label: "Agents" },
  { value: "prompt", label: "Prompts" },
] as const;

export function useMarketplace() {
  return useQuery({
    queryKey: ["marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id, slug, name, description, resource_type, category_slug, verified, featured")
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

function ExplorePage() {
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");
  const { data, isLoading } = useMarketplace();

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      const matchesType = type === "all" || item.resource_type === type;
      const matchesTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.description ?? "").toLowerCase().includes(term);
      return matchesType && matchesTerm;
    });
  }, [data, query, type]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Explore</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Skills, Apps, Models, MCP servers, Tools, Agents and Prompts. Pick what your agent needs and
            bundle it into a Toolkit.
          </p>
        </div>
        <Button asChild>
          <Link to="/toolkits">Build a Toolkit</Link>
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the marketplace…"
            className="pl-9"
            aria-label="Search the marketplace"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {EXPLORE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setType(tab.value)}
              className={cn(
                "rounded-full border border-border/70 px-3 py-1.5 text-xs transition-colors",
                type === tab.value
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)
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
                <CardContent className="text-xs text-muted-foreground">{item.category_slug}</CardContent>
              </Card>
            ))}
      </div>

      {!isLoading && results.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">Nothing matches that search yet.</p>
      ) : null}
    </div>
  );
}
