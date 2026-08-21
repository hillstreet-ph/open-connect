import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, Cpu, KeyRound, Plug, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Open-Connect — Connect your AI to everything" },
      {
        name: "description",
        content:
          "One gateway for agent resources, app connections and AI models. One account, one API key, one MCP URL.",
      },
      { property: "og:title", content: "Open-Connect — Connect your AI to everything" },
    ],
  }),
  component: Home,
});

const pillars = [
  {
    icon: Boxes,
    category: "Resources",
    title: "Marketplace",
    body: "Skills, MCP servers, tools, plugins, agents, prompts and guides — browse and download.",
    to: "/resources" as const,
  },
  {
    icon: Plug,
    category: "Connections",
    title: "Connect apps",
    body: "GitHub, Telegram, ChatGPT, Grok and more — capability without exposing secrets.",
    to: "/connections" as const,
  },
  {
    icon: Cpu,
    category: "Models",
    title: "AI models",
    body: "Many providers through one OpenAI-compatible /v1 gateway.",
    to: "/models" as const,
  },
];

const interfaces = [
  { label: "MCP", value: "open-connect.site/mcp" },
  { label: "Models", value: "open-connect.site/v1" },
  { label: "API", value: "open-connect.site/api/v1" },
  { label: "OAuth", value: "open-connect.site/oauth" },
];

function Home() {
  const { user, loading } = useAuth();
  const signedIn = Boolean(user);

  return (
    <div>
      <section className="relative overflow-hidden bg-hero">
        <div className="absolute inset-0 grid-lines opacity-60" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center sm:py-28">
          <Badge variant="outline" className="border-primary/40 text-primary">
            <Sparkles className="mr-1 size-3" /> Resources · Connections · Models
          </Badge>
          <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold sm:text-5xl md:text-6xl">
            <span className="text-gradient">Connect your AI to everything.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            One account, one key, one MCP URL — for ChatGPT, Claude, Grok, Hermes and custom agents.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {loading ? null : signedIn ? (
              <>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/dashboard">
                    Open dashboard <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link to="/resources">Marketplace</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Get started <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link to="/resources">Explore marketplace</Link>
                </Button>
              </>
            )}
          </div>

          <div className="mx-auto mt-12 grid max-w-2xl gap-2 sm:grid-cols-2">
            {interfaces.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 px-3 py-2.5 text-left sm:px-4"
              >
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {item.label}
                </span>
                <span className="truncate font-mono text-[11px] text-primary sm:text-xs">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Discover
        </p>
        <h2 className="mt-1 text-xl font-semibold sm:text-3xl">Three categories, one platform</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Everything your agents need — organized simply.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {pillars.map((pillar) => (
            <Card key={pillar.title} className="bg-pillar shadow-panel">
              <CardHeader className="p-5">
                <Badge variant="secondary" className="w-fit text-[10px] uppercase">
                  {pillar.category}
                </Badge>
                <span className="mt-3 flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <pillar.icon className="size-5" />
                </span>
                <CardTitle className="mt-3 text-lg">{pillar.title}</CardTitle>
                <CardDescription>{pillar.body}</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Link
                  to={pillar.to}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Open <ArrowRight className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border/70 bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:py-16">
          {[
            {
              icon: KeyRound,
              title: "One scoped key",
              body: "oc_live_ keys are hashed, scoped, and revocable.",
            },
            {
              icon: Shield,
              title: "Secrets stay server-side",
              body: "Agents get capability — never raw provider tokens.",
            },
            {
              icon: Sparkles,
              title: "Any AI client",
              body: "MCP, OAuth, API keys — ChatGPT, Claude, Grok, Hermes.",
            },
          ].map((item) => (
            <div key={item.title} className="text-center sm:text-left">
              <item.icon className="mx-auto size-5 text-accent sm:mx-0" />
              <p className="mt-3 font-display text-base font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 text-center sm:py-20">
        <h2 className="text-xl font-semibold sm:text-3xl">
          {signedIn ? "Continue in your workspace" : "Ready to connect an agent?"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {signedIn
            ? "Keys, agents, and packages live in the dashboard."
            : "Create an account, mint a key, point MCP at open-connect.site/mcp."}
        </p>
        <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
          {signedIn ? (
            <Link to="/dashboard">Open dashboard</Link>
          ) : (
            <Link to="/auth" search={{ mode: "signup" }}>
              Create account
            </Link>
          )}
        </Button>
        <p className="mt-4">
          <Link to="/integrations" className="text-sm text-primary hover:underline">
            Setup guides for ChatGPT, Grok, Telegram →
          </Link>
        </p>
      </section>
    </div>
  );
}
