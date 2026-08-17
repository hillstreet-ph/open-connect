import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/connections")({
  head: () => ({
    meta: [
      { title: "Connect Apps — Open-Connect" },
      {
        name: "description",
        content:
          "Connect GitHub, Slack, Notion, Google Drive and more with OAuth. Your agents get capability, never raw credentials.",
      },
      { property: "og:title", content: "Connect Apps — Open-Connect" },
      {
        property: "og:description",
        content:
          "OAuth applications, APIs, actions and triggers behind a secure credential boundary.",
      },
    ],
  }),
  component: ConnectionsPage,
});

const apps = [
  { name: "GitHub", category: "Development" },
  { name: "Google Drive", category: "Productivity" },
  { name: "Gmail", category: "Communication" },
  { name: "Slack", category: "Communication" },
  { name: "Notion", category: "Productivity" },
  { name: "Linear", category: "Development" },
  { name: "Cloudflare", category: "Infrastructure" },
  { name: "Snowflake", category: "Data" },
];

function ConnectionsPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return apps.filter((app) => !term || app.name.toLowerCase().includes(term));
  }, [query]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl font-semibold sm:text-4xl">Connect Apps</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        One OAuth flow per application. Open-Connect holds the credential; your agents receive a
        scoped capability instead.
      </p>

      <div className="relative mt-8 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search applications…"
          className="pl-9"
          aria-label="Search applications"
        />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((app) => (
          <Card key={app.name} className="flex flex-row items-center justify-between p-5">
            <div>
              <p className="font-display text-base font-semibold">{app.name}</p>
              <p className="text-xs text-muted-foreground">{app.category}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/auth">Connect</Link>
            </Button>
          </Card>
        ))}
      </div>

      <Card className="mt-14 bg-pillar shadow-panel">
        <CardHeader>
          <Badge variant="outline" className="w-fit border-primary/40 text-primary">
            <Lock className="mr-1 size-3" /> Credential boundary
          </Badge>
          <CardTitle className="mt-3">Agents never see the secret</CardTitle>
          <CardDescription>
            Refresh tokens, client secrets and provider API keys stay server-side. An agent presents
            an Open-Connect scoped key; the gateway validates permission and calls the provider on
            its behalf.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="mt-10">
        <Button asChild>
          <Link to="/auth" search={{ mode: "signup" }}>
            Create an account to connect apps <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
