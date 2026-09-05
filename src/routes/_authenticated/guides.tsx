import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Boxes,
  Download,
  ExternalLink,
  KeyRound,
  Plug,
  Shield,
  Wrench,
} from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/guides")({
  head: () => ({
    meta: [
      { title: "Guides — Open-Connect" },
      {
        name: "description",
        content: "User guide, marketplace access, and professional E2E setup. Not part of the marketplace catalog.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuidesPage,
});

const DEMO_BASE = "/downloads/open-connect-control-plane-demo";

const userGuideSections = [
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
      <h1 className="text-2xl font-semibold sm:text-3xl">Guidelines</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Guides are <strong className="font-medium text-foreground">not</strong> marketplace catalog
        items. Use the buttons below: packages live in Marketplace; how-to lives here; professional
        E2E demos live under downloads.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Your role:{" "}
        <span className="font-medium text-foreground">{loading ? "…" : primary}</span>
      </p>

      {/* Primary hub buttons */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Card className="shadow-panel">
          <CardHeader className="p-5 pb-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Boxes className="size-5" />
            </span>
            <CardTitle className="mt-3 text-base">Marketplace (all packages)</CardTitle>
            <CardDescription>
              Skills, MCP, tools, plugins, agents, prompts. Sign-in required to download.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Button asChild className="w-full">
              <Link to="/resources">Open Marketplace</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader className="p-5 pb-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <BookOpen className="size-5" />
            </span>
            <CardTitle className="mt-3 text-base">User guide</CardTitle>
            <CardDescription>
              MCP, OAuth, connections, models, roles — step-by-step for clients.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Button asChild variant="outline" className="w-full" onClick={() => {
              document.getElementById("user-guide")?.scrollIntoView({ behavior: "smooth" });
            }}>
              <a href="#user-guide">Jump to user guide</a>
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader className="p-5 pb-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Wrench className="size-5" />
            </span>
            <CardTitle className="mt-3 text-base">Professional setup E2E</CardTitle>
            <CardDescription>
              Control-plane policy demo package (YAML, tests, validator). Not a marketplace listing.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Button asChild variant="outline" className="w-full">
              <a href="#professional-e2e">Open E2E package</a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* User guide detail */}
      <h2 id="user-guide" className="mt-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        User guide
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {userGuideSections.map((g) => (
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

      {/* Professional E2E package */}
      <h2
        id="professional-e2e"
        className="mt-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Professional setup E2E
      </h2>
      <Card className="mt-3 shadow-panel">
        <CardHeader className="p-5">
          <CardTitle className="text-base">Control plane demo package</CardTitle>
          <CardDescription>
            Deny-by-default policy, vault references, approval rules, and local validator. Served from{" "}
            <code className="font-mono text-xs">/downloads/open-connect-control-plane-demo/</code> on
            the edge — not from the Marketplace catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <a className="text-primary hover:underline" href={`${DEMO_BASE}/README.md`}>
                README.md
              </a>
            </li>
            <li>
              <a className="text-primary hover:underline" href={`${DEMO_BASE}/control-plane.yaml`}>
                control-plane.yaml
              </a>
            </li>
            <li>
              <a className="text-primary hover:underline" href={`${DEMO_BASE}/test-cases.yaml`}>
                test-cases.yaml
              </a>
            </li>
            <li>
              <a className="text-primary hover:underline" href={`${DEMO_BASE}/validate_demo.py`}>
                validate_demo.py
              </a>
            </li>
            <li>
              <a className="text-primary hover:underline" href={`${DEMO_BASE}/validation-report.md`}>
                validation-report.md
              </a>
            </li>
            <li>
              <a className="text-primary hover:underline" href={`${DEMO_BASE}/audit-events.jsonl`}>
                audit-events.jsonl
              </a>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href={`${DEMO_BASE}/README.md`}>
                <Download className="mr-1 size-3.5" /> Open package README
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/resources">Marketplace</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Local validate: <code className="font-mono">pip install pyyaml && python validate_demo.py</code>
          </p>
        </CardContent>
      </Card>

      <Card className="mt-10 bg-pillar">
        <CardHeader className="p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4" /> Public vs workspace
          </CardTitle>
          <CardDescription>
            Anyone can view the homepage and marketplace catalog. Sign-in is required to download
            packages, upload, manage keys, secrets, agents, and connections. Guides stay in the
            workspace — not in the marketplace grid.
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
