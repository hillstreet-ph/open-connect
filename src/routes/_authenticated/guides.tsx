import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, KeyRound, Plug, Shield } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/guides")({
  head: () => ({
    meta: [
      { title: "Guides — Open-Connect" },
      { name: "description", content: "Setup guides for MCP, OAuth, API keys, and app connections." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuidesPage,
});

const guides = [
  {
    id: "mcp",
    title: "MCP client setup",
    body: "Point Claude, Cursor, Hermes, or any MCP client at the Open-Connect gateway with a scoped key.",
    steps: [
      "Create an API key under API Keys (includes mcp:connect).",
      "Set MCP URL to https://open-connect.site/mcp",
      "Add header Authorization: Bearer oc_live_…",
      "Call tools/list to see marketplace and platform tools.",
    ],
    href: "/api-keys",
    hrefLabel: "Create API key",
  },
  {
    id: "oauth",
    title: "OAuth for AI clients",
    body: "ChatGPT and OAuth MCP clients use PKCE S256 against Open-Connect discovery endpoints.",
    steps: [
      "Discovery: /.well-known/oauth-authorization-server",
      "Resource: /.well-known/oauth-protected-resource",
      "Authorize with code_challenge_method=S256",
      "Paste an oc_live_ key on the consent screen",
    ],
    href: "/integrations",
    hrefLabel: "Integrations overview",
  },
  {
    id: "connections",
    title: "Connect apps",
    body: "Link GitHub, Slack, Drive, and more. Agents receive capability grants — never raw tokens.",
    steps: [
      "Open Connections and sign in if needed.",
      "Click Connect on an app.",
      "Capability is stored server-side as a credential reference.",
      "MCP resource invoke can resolve matching grants.",
    ],
    href: "/connections",
    hrefLabel: "Open Connections",
  },
  {
    id: "marketplace",
    title: "Download skills and agents",
    body: "Marketplace packages require a signed-in account. Uploads happen from the dashboard.",
    steps: [
      "Browse /resources publicly to discover packages.",
      "Sign in to download skill, MCP, tool, plugin, agent, or prompt packages.",
      "Upload new packages from Dashboard (role: user+).",
      "Publishers/admins can verify featured packages.",
    ],
    href: "/resources",
    hrefLabel: "Open Marketplace",
  },
  {
    id: "models",
    title: "Models gateway",
    body: "OpenAI-compatible /v1 with Open-Connect aliases and your scoped key.",
    steps: [
      "Base URL: https://open-connect.site/v1",
      "Use models:read / models:invoke scopes",
      "Aliases: open-connect/fast, balanced, reasoning, coding, vision",
      "POST /v1/chat/completions with Bearer oc_live_…",
    ],
    href: "/models",
    hrefLabel: "Models",
  },
  {
    id: "roles",
    title: "Roles and permissions",
    body: "Your role controls uploads, publishing, and admin. Defaults to user after signup.",
    steps: [
      "user — dashboard, keys, download, upload own packages",
      "developer — toolkits",
      "publisher — publish resources",
      "admin / owner — verify packages, roles, admin panel",
    ],
    href: "/settings",
    hrefLabel: "Account settings",
  },
];

function GuidesPage() {
  const { primary, loading } = useRoles();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        <BookOpen className="mr-1 size-3" /> Workspace · Guides
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-3xl">Setup guides</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        How-to docs for the signed-in product. Guides were moved out of the public marketplace so
        visitors discover packages there, and clients get instructions here after login.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Your role:{" "}
        <span className="font-medium text-foreground">{loading ? "…" : primary}</span>
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {guides.map((g) => (
          <Card key={g.id} className="shadow-panel">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-base">{g.title}</CardTitle>
              <CardDescription>{g.body}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-2">
              <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
                {g.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <Button asChild size="sm" variant="outline">
                <Link to={g.href}>{g.hrefLabel}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-10 bg-pillar">
        <CardHeader className="p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4" /> Public vs workspace
          </CardTitle>
          <CardDescription>
            Anyone can view the homepage and marketplace catalog. Sign-in is required to download
            packages, upload, manage keys, secrets, agents, and connections.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 px-5 pb-5">
          <Button asChild size="sm">
            <Link to="/dashboard">
              <KeyRound className="mr-1 size-3.5" /> Dashboard
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/connections">
              <Plug className="mr-1 size-3.5" /> Connections
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="https://open-connect.site/mcp" target="_blank" rel="noreferrer">
              MCP endpoint <ExternalLink className="ml-1 size-3" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
