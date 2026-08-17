import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, Cpu, KeyRound, Plug, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      {
        property: "og:description",
        content:
          "Discover agent resources, connect applications and access AI models through one gateway.",
      },
    ],
  }),
  component: Home,
});

const pillars = [
  {
    icon: Boxes,
    title: "Agent Resources",
    body: "Skills, MCP servers, tools, plugins, agents, prompts and guides in one normalized registry.",
    to: "/resources" as const,
  },
  {
    icon: Plug,
    title: "Connect Apps",
    body: "OAuth applications, APIs, actions, triggers and workflows behind a secure credential boundary.",
    to: "/connections" as const,
  },
  {
    icon: Cpu,
    title: "AI Models",
    body: "Multiple providers and models through one OpenAI-compatible gateway with routing and fallbacks.",
    to: "/models" as const,
  },
];

const interfaces = [
  { label: "MCP", value: "open-connect.site/mcp" },
  { label: "REST API", value: "open-connect.site/api/v1" },
  { label: "OAuth", value: "open-connect.site/oauth" },
  { label: "Models", value: "open-connect.site/v1" },
];

function Home() {
  return (
    <div>
      <section className="relative overflow-hidden bg-hero">
        <div className="absolute inset-0 grid-lines opacity-60" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:py-32">
          <Badge variant="outline" className="border-primary/40 text-primary">
            <Sparkles className="mr-1 size-3" /> Three planes, one platform
          </Badge>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold sm:text-6xl">
            <span className="text-gradient">Connect your AI to everything.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Discover agent resources, connect applications, and access AI models through one
            gateway — one account, one key, one MCP URL.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/resources">Explore resources</Link>
            </Button>
          </div>

          <div className="mx-auto mt-16 grid max-w-3xl gap-3 sm:grid-cols-2">
            {interfaces.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 px-4 py-3 text-left"
              >
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {item.label}
                </span>
                <span className="font-mono text-xs text-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-2xl font-semibold sm:text-3xl">One platform, three pillars</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The complexity stays behind the gateway. Your agents receive capability, never raw
          credentials.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {pillars.map((pillar) => (
            <Card key={pillar.title} className="bg-pillar shadow-panel">
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <pillar.icon className="size-5" />
                </span>
                <CardTitle className="mt-4">{pillar.title}</CardTitle>
                <CardDescription>{pillar.body}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  to={pillar.to}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Learn more <ArrowRight className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border/70 bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
          {[
            {
              icon: KeyRound,
              title: "One scoped key",
              body: "oc_live_… keys are hashed at rest, scoped per capability and revocable at any time.",
            },
            {
              icon: Shield,
              title: "Credentials never leak",
              body: "Provider secrets, refresh tokens and master keys stay server-side behind the gateway.",
            },
            {
              icon: Sparkles,
              title: "Toolkits",
              body: "Bundle skills, MCP servers, connections, tools and model policy into one install.",
            },
          ].map((item) => (
            <div key={item.title}>
              <item.icon className="size-5 text-accent" />
              <p className="mt-3 font-display text-base font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">Ready to connect an agent?</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Create your Open-Connect account, then wire ChatGPT, Claude, Hermes or any MCP client to
          your gateway.
        </p>
        <Button asChild size="lg" className="mt-7">
          <Link to="/auth" search={{ mode: "signup" }}>
            Create account
          </Link>
        </Button>
      </section>
    </div>
  );
}
