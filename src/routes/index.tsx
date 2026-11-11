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
          "Open-Connect is one gateway for AI agent resources, app connections and AI models. Discover skills and tools, connect your accounts, and run tasks and automations from a single workspace.",
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
    body: "Link the services your agents work with, such as GitHub, Notion, Slack and Google Drive. Each connection keeps its own permissions and credentials.",
    points: [
      "See which account is connected and when it was last used",
      "Inspect the tools and permissions each connection exposes",
      "Repair, refresh or revoke a connection at any time",
    ],
    to: "/connections" as const,
    action: "Manage connectors",
    purpose:
      "Opens the Connections page, where every linked app account and its granted tools are listed and managed.",
  },
  {
    icon: Sparkles,
    title: "Choose your AI models",
    body: "Connect model providers in AI Gateway and call them through one OpenAI-compatible endpoint, with usage and keys handled for you.",
    points: [
      "Bring your own provider keys or use gateway-managed models",
      "One endpoint for chat, embeddings and vision requests",
      "Track usage per client, key and model",
    ],
    to: "/models" as const,
    action: "Set up AI Gateway",
    purpose:
      "Opens AI Gateway setup, where model providers are connected and model keys are issued for your clients.",
  },
  {
    icon: Bot,
    title: "Put your workspace to work",
    body: "Organize tasks and AI automations in one place, and let Agent-Helper plan the next step from your projects and knowledge.",
    points: [
      "Create tasks from chat, schedules or connected apps",
      "Run automations on a schedule with clear run history",
      "Ask Agent-Helper to draft and execute the next step",
    ],
    to: "/tasks" as const,
    action: "Open tasks",
    purpose:
      "Opens the Tasks board, where work items, schedules and automation runs are created and tracked.",
  },
];

const steps = [
  {
    step: "1",
    title: "Create your workspace",
    body: "Sign up with your email. Your workspace comes with resources, connections, credentials and an AI gateway ready to configure.",
  },
  {
    step: "2",
    title: "Connect apps and models",
    body: "Authorize the accounts your agents should use, and connect model providers in AI Gateway. Permissions stay scoped per connection.",
  },
  {
    step: "3",
    title: "Run agents and automations",
    body: "Attach your AI client over MCP or the Model API, then create tasks, schedules and automations that use your connected tools.",
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
          Open-Connect is one gateway for agent resources, app connections and AI models. Discover
          skills and tools, connect the accounts you use, and turn ideas into tasks and automations,
          all from a single workspace.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <div className="min-w-0">
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
            <p className="mt-2 text-xs text-muted-foreground">
              {user
                ? "Go straight to your dashboard, connections and running tasks."
                : "Free to start. Takes under a minute, no credit card required."}
            </p>
          </div>
          <div className="min-w-0">
            <Button asChild size="lg" variant="outline">
              <Link to="/resources">Explore Marketplace</Link>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Browse published skills, plugins, prompts and MCP tools you can install.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="workspace-features" className="border-t border-border py-12">
        <h2 id="workspace-features" className="font-display text-2xl font-semibold">
          Your workspace, connected
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Three building blocks cover the full loop: link your apps, pick your models, and put the
          result to work as tasks and automations.
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body, points, to, action, purpose }) => (
            <article
              key={to}
              className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-6"
            >
              <Icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
              <ul className="mb-6 mt-4 flex-1 space-y-2 text-sm leading-6 text-muted-foreground">
                {points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden="true" className="text-primary">
                      ·
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={to}
                aria-label={`${action}: ${purpose}`}
                title={purpose}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                {action}
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-it-works-heading" className="border-t border-border py-12">
        <h2 id="how-it-works-heading" className="font-display text-2xl font-semibold">
          How it works
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {steps.map(({ step, title, body }) => (
            <article key={step} className="rounded-2xl border border-border bg-card p-6">
              <span className="inline-flex size-8 items-center justify-center rounded-full border border-border text-sm font-semibold text-primary">
                {step}
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
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
            own permissions and credentials, so a client only reaches what you granted it.
          </p>
          <div className="mt-6">
            <Link
              to="/integrations"
              search={{ section: "api-key" }}
              aria-label="View developer setup: step-by-step instructions for wiring ChatGPT, Codex, Claude and other clients to Open-Connect"
              title="Step-by-step instructions for wiring AI clients to Open-Connect"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              View developer setup <ArrowRight className="size-4" />
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Copy-ready configuration for ChatGPT, Codex, Claude and other MCP or OpenAI-compatible
              clients.
            </p>
          </div>
        </div>
        <dl className="min-w-0 space-y-6 text-sm">
          <div>
            <dt className="font-semibold">Model API</dt>
            <dd className="mt-2 break-all font-mono text-xs text-muted-foreground">
              https://open-connect.site/v1
            </dd>
            <dd className="mt-2 text-muted-foreground">
              Point OpenAI-compatible clients here. Create a model key in AI Gateway first; the key
              selects the provider and tracks usage.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">MCP tools</dt>
            <dd className="mt-2 break-all font-mono text-xs text-muted-foreground">
              https://open-connect.site/mcp
            </dd>
            <dd className="mt-2 text-muted-foreground">
              Add this URL as an MCP server in your client. Authorize with OAuth or a scoped
              workspace key to grant tool access.
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="cta-heading"
        className="mt-12 rounded-2xl border border-border bg-card p-6 text-center sm:p-10"
      >
        <h2 id="cta-heading" className="font-display text-2xl font-semibold">
          Ready to connect your first app?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Create a workspace, connect one account, and run your first automation today. You can
          revoke any connection or key at any time.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
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
    </div>
  );
}
