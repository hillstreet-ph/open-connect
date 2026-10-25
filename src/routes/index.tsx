import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Plug, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Open-Connect — Your AI workspace" },
      {
        name: "description",
        content:
          "Discover agent resources, connect your apps and AI models, and organize tasks and automations in one workspace.",
      },
      { property: "og:title", content: "Open-Connect — Your AI workspace" },
    ],
  }),
  component: Home,
});

const features = [
  {
    icon: Plug,
    title: "Connect your apps",
    body: "See which account is connected, inspect available tools and permissions, and manage each connection.",
    to: "/connections" as const,
    action: "Manage connectors",
  },
  {
    icon: Sparkles,
    title: "Choose your AI models",
    body: "Connect model providers in AI Gateway and use your models through an OpenAI-compatible endpoint.",
    to: "/models" as const,
    action: "Set up AI Gateway",
  },
  {
    icon: Bot,
    title: "Put your workspace to work",
    body: "Organize tasks and AI automations. Agent-Helper can look up your projects and help you create the next step.",
    to: "/tasks" as const,
    action: "Open tasks",
  },
];

function Home() {
  const { user } = useAuth();
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-16 sm:px-6">
      <section className="py-16 sm:py-24">
        <p className="text-sm font-medium text-primary">Apps, models, and agent resources</p>
        <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Bring your AI work together.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          Discover skills and tools, connect the accounts you use, and turn ideas into tasks and
          automations in Open-Connect.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            {user ? (
              <Link to="/dashboard">
                Open workspace <ArrowRight className="size-4" />
              </Link>
            ) : (
              <Link to="/auth" search={{ mode: "signup" }}>
                Create account <ArrowRight className="size-4" />
              </Link>
            )}
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/resources">Explore Marketplace</Link>
          </Button>
        </div>
      </section>
      <section aria-labelledby="workspace-features" className="border-t border-border py-12">
        <h2 id="workspace-features" className="font-display text-2xl font-semibold">
          Your workspace, connected
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body, to, action }) => (
            <article
              key={to}
              className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-6"
            >
              <Icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mb-6 mt-3 flex-1 text-sm leading-6 text-muted-foreground">{body}</p>
              <Link
                to={to}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                {action}
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section
        aria-labelledby="gateway-heading"
        className="grid gap-8 rounded-2xl border border-border bg-surface/40 p-6 sm:p-10 md:grid-cols-2"
      >
        <div className="min-w-0">
          <h2 id="gateway-heading" className="font-display text-2xl font-semibold">
            Connect your AI clients
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Use AI Gateway for model requests and MCP for workspace tools. Each connection keeps its
            own permissions and credentials.
          </p>
          <Link
            to="/integrations"
            search={{ section: "ai-agents" }}
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            View integration setup <ArrowRight className="size-4" />
          </Link>
        </div>
        <dl className="min-w-0 space-y-6 text-sm">
          <div>
            <dt className="font-semibold">Model API</dt>
            <dd className="mt-2 break-all font-mono text-xs text-muted-foreground">
              https://open-connect.site/v1
            </dd>
            <dd className="mt-2 text-muted-foreground">
              Create a model key in AI Gateway for OpenAI-compatible clients.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">MCP tools</dt>
            <dd className="mt-2 break-all font-mono text-xs text-muted-foreground">
              https://open-connect.site/mcp
            </dd>
            <dd className="mt-2 text-muted-foreground">
              Use OAuth or a scoped workspace key to authorize tool access.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
