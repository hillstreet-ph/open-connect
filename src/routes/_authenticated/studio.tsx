import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  Boxes,
  Building2,
  FileCode,
  MessageSquareText,
  Plug,
  Puzzle,
  Sparkles,
  Wrench,
} from "lucide-react";
import { ResourceLibraryCard } from "@/components/resource-library-card";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Open-Connect" },
      {
        name: "description",
        content: "Create AI agents, skills, prompts, plugins, custom MCP, and connectors.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioPage,
});

const createActions = [
  {
    icon: Bot,
    title: "AI Agent",
    body: "Register an MCP agent and mint a scoped oc_live_ key.",
    to: "/agents" as const,
    cta: "Connect agent",
  },
  {
    icon: Boxes,
    title: "Skill",
    body: "Upload a skill package (.zip / SKILL.md) to the marketplace.",
    type: "skill",
  },
  {
    icon: MessageSquareText,
    title: "Prompt",
    body: "Publish a reusable system or task prompt package.",
    type: "prompt",
  },
  {
    icon: Puzzle,
    title: "Plugin",
    body: "Ship a plugin package for ChatGPT Actions or custom agents.",
    type: "plugin",
  },
  {
    icon: FileCode,
    title: "Custom MCP",
    body: "Publish an MCP server package or connect an external MCP URL.",
    to: "/agents" as const,
    cta: "MCP URL",
    type: "mcp",
  },
  {
    icon: Plug,
    title: "Connection / connector",
    body: "Link GitHub, Slack, Drive, Cloudflare, Supabase, and more.",
    to: "/connections" as const,
    cta: "Connect apps",
  },
  {
    icon: Sparkles,
    title: "Model providers",
    body: "Use OpenAI-compatible /v1 with OpenRouter and aliases.",
    to: "/models" as const,
    cta: "Models gateway",
  },
  {
    icon: Wrench,
    title: "Tool",
    body: "Upload a tool definition package for agents.",
    type: "tool",
  },
];

function StudioPage() {
  const { primary, can } = useRoles();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-primary/40 text-primary">
          Workspace · Studio hub
        </Badge>
        <Badge variant="secondary" className="uppercase">
          {roleLabel(primary)}
        </Badge>
      </div>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Create</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Build agents, skills, prompts, plugins, custom MCP, and connectors. Assign work to an{" "}
        <Link to="/orgs" className="text-primary underline-offset-2 hover:underline">
          organization / project
        </Link>
        , then wire ChatGPT, Claude, Grok, Open WebUI, or Hermes.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/orgs">
            <Building2 className="mr-1 size-3.5" /> Organizations
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/guides">Professional setup</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard">Dashboard hub</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {createActions.map((item) => (
          <Card key={item.title} className="shadow-panel">
            <CardHeader className="p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <item.icon className="size-4" />
              </span>
              <CardTitle className="mt-3 text-base">{item.title}</CardTitle>
              <CardDescription className="text-xs">{item.body}</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {item.to ? (
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to={item.to}>{item.cta ?? "Open"}</Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="w-full">
                  <a href="#upload">{item.cta ?? "Upload below"}</a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {can("upload_resources") ? (
        <>
          <h2
            id="upload"
            className="mt-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Upload package
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Skills, MCP, tools, plugins, agents, prompts — auto-detected type, then publish.
          </p>
          <div className="mt-4 max-w-2xl">
            <ResourceLibraryCard />
          </div>
        </>
      ) : (
        <p className="mt-10 text-sm text-muted-foreground">
          Your role cannot upload packages. Contact an admin to raise permissions.
        </p>
      )}

      <Card className="mt-10 bg-pillar">
        <CardHeader className="p-5">
          <CardTitle className="text-base">Wire into any AI chat</CardTitle>
          <CardDescription>
            After you create a key, point the client at Open-Connect MCP and /v1.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 px-5 pb-5">
          <Button asChild size="sm">
            <Link to="/api-keys">API Keys</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/guides">Professional setup</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/integrations">Client integrations</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/orgs">Organizations</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
