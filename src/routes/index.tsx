import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Boxes,
  Building2,
  Code2,
  FileCode,
  LayoutDashboard,
  MessageSquare,
  Plug,
  Shield,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Open-Connect — AI workspace hub for agents, MCP & skills" },
      {
        name: "description",
        content:
          "Workspace hub for Open-Connect. Connect Open WebUI, ChatGPT, Claude, Grok. Studio, orgs, marketplace, roles — GitHub + Cloudflare + Supabase.",
      },
      { property: "og:title", content: "Open-Connect — Your team AI workspace" },
    ],
  }),
  component: Home,
});

const megaFeatures = [
  {
    group: "Workspace",
    items: [
      { icon: LayoutDashboard, title: "Studio", body: "Create agents, skills, prompts, plugins, MCP", to: "/studio" as const },
      { icon: Building2, title: "Organizations", body: "Orgs and projects for your team", to: "/orgs" as const },
      { icon: Code2, title: "Coding agents", body: "MCP agents with scoped oc_live_ keys", to: "/agents" as const },
      { icon: FileCode, title: "Guides", body: "Professional E2E setup docs", to: "/guides" as const },
    ],
  },
  {
    group: "Integration",
    items: [
      { icon: MessageSquare, title: "Open WebUI", body: "Point base URL at /v1 with your key", to: "/integrations" as const },
      { icon: Plug, title: "Slack · Discord · Telegram", body: "Connect chat apps to agents", to: "/connections" as const },
      { icon: Sparkles, title: "ChatGPT · Claude · Grok", body: "OAuth + MCP clients", to: "/integrations" as const },
      { icon: Boxes, title: "Marketplace", body: "Skills, MCP, tools, plugins", to: "/resources" as const },
    ],
  },
  {
    group: "Core platform",
    items: [
      { icon: Terminal, title: "MCP gateway", body: "https://open-connect.site/mcp", to: "/integrations" as const },
      { icon: Sparkles, title: "Models /v1", body: "OpenAI-compatible multi-provider", to: "/models" as const },
      { icon: Shield, title: "Role scopes", body: "user · developer · publisher · admin", to: "/dashboard" as const },
      { icon: Wrench, title: "API keys", body: "Scoped oc_live_ keys", to: "/api-keys" as const },
    ],
  },
];

const marketStats = [
  { label: "Agents", value: "—", hint: "Connect MCP agents", to: "/agents" as const, icon: Bot },
  { label: "MCP", value: "/mcp", hint: "One URL for tools", to: "/integrations" as const, icon: Plug },
  { label: "Skills", value: "40+", hint: "Marketplace packages", to: "/resources" as const, icon: Boxes },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "Workspace starter",
    cta: "Get started",
    popular: false,
    features: [
      "Studio · create agents & skills",
      "Marketplace browse + download (login)",
      "Open WebUI / Claude / Grok via MCP & /v1",
      "1 organization · projects",
      "Scoped oc_live_ API keys",
      "Role: user",
    ],
  },
  {
    name: "Team",
    price: "Self-host",
    period: "GitHub + CF + Supabase",
    cta: "Open dashboard",
    popular: true,
    features: [
      "Everything in Free",
      "Organizations & projects",
      "Connections catalog (GitHub, Slack…)",
      "Secrets vault · toolkits (developer+)",
      "Professional E2E guides",
      "Full role scopes · admin when granted",
    ],
  },
  {
    name: "Open WebUI",
    price: "Bring yours",
    period: "Rebrand to open-connect.site",
    cta: "Integration guide",
    popular: false,
    features: [
      "Base URL → https://open-connect.site/v1",
      "API key → oc_live_…",
      "MCP → https://open-connect.site/mcp",
      "Models aliases open-connect/*",
      "Same stack as production hub",
      "No Vercel — CF Pages edge only",
    ],
  },
];

function Home() {
  const { user, loading } = useAuth();
  const signedIn = Boolean(user);

  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-card/40">
        <div className="mx-auto hidden max-w-6xl gap-8 px-4 py-6 lg:grid lg:grid-cols-3">
          {megaFeatures.map((col) => (
            <div key={col.group}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {col.group}
              </p>
              <ul className="mt-3 space-y-2">
                {col.items.map((item) => (
                  <li key={item.title}>
                    <Link
                      to={item.to}
                      className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <item.icon className="size-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">{item.body}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-stretch gap-3 px-4 py-6">
          {marketStats.map((s) => (
            <Link
              key={s.label}
              to={s.to}
              className="min-w-[8rem] flex-1 rounded-xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/40"
            >
              <s.icon className="size-4 text-primary" />
              <p className="mt-2 font-mono text-lg font-semibold tabular-nums">{s.value}</p>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </Link>
          ))}
          <div className="flex min-w-[10rem] flex-1 flex-col justify-center gap-2 rounded-xl border border-border/70 bg-card/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Social
            </p>
            <div className="flex flex-wrap gap-2">
              {["github", "discord", "slack"].map((p) => (
                <BrandLogo key={p} provider={p} size="sm" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero opacity-80" aria-hidden />
        <div className="absolute inset-0 grid-lines opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <Badge variant="outline" className="border-primary/40 text-primary">
            Open-Connect · open-connect.site
          </Badge>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Your team just needs an{" "}
            <span className="text-gradient">Open-Connect workspace</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Hub Studio · organizations · professional setup · role scopes. Connect{" "}
            <strong className="text-foreground">Open WebUI</strong>, ChatGPT, Claude, Grok, and Hermes
            through one MCP URL and one model gateway — not a pile of single-purpose tools.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {loading ? null : signedIn ? (
              <>
                <Button asChild size="lg">
                  <Link to="/dashboard">
                    Open workspace <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/studio">Studio</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Get started <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/resources">Marketplace</Link>
                </Button>
              </>
            )}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Trusted stack: GitHub · Cloudflare · Supabase · OpenRouter
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {["github", "cloudflare", "supabase", "openai", "anthropic"].map((p) => (
              <BrandLogo key={p} provider={p} size="sm" />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">
              One hub for your team's AI superpower
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Replace scattered keys and tools with Open-Connect: Studio to create, organizations to
              group work, marketplace to share skills, and role scopes so clients only get what they
              need.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                Open WebUI → base URL <code className="font-mono text-xs text-primary">/v1</code>
              </li>
              <li className="flex gap-2">
                <Plug className="mt-0.5 size-4 shrink-0 text-primary" />
                MCP clients → <code className="font-mono text-xs text-primary">/mcp</code> + Bearer key
              </li>
              <li className="flex gap-2">
                <Shield className="mt-0.5 size-4 shrink-0 text-primary" />
                Login required to download agents & skills
              </li>
            </ul>
          </div>
          <Card className="border-primary/30 bg-pillar shadow-panel">
            <CardHeader>
              <CardTitle className="text-base">Open WebUI rebrand path</CardTitle>
              <CardDescription>
                Point your Open WebUI instance at Open-Connect instead of a single vendor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs">
              <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                <span className="text-muted-foreground">OPENAI_API_BASE=</span>
                <span className="text-primary">https://open-connect.site/v1</span>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                <span className="text-muted-foreground">OPENAI_API_KEY=</span>
                <span className="text-accent">oc_live_…</span>
              </div>
              <Button asChild size="sm" className="mt-2 w-full">
                <Link to="/integrations">Full integration guide</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
          <div className="text-center">
            <Badge variant="secondary">Plans · workspace access</Badge>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Start free. Scale with roles.</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Not a credit store — capability and role scopes on open-connect.site.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.popular
                    ? "relative border-primary/50 shadow-panel ring-1 ring-primary/30"
                    : "shadow-panel"
                }
              >
                {plan.popular ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                ) : null}
                <CardHeader className="p-5">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <p className="text-2xl font-semibold tabular-nums">{plan.price}</p>
                  <CardDescription>{plan.period}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <Button asChild className="w-full" variant={plan.popular ? "default" : "outline"}>
                    <Link
                      to={
                        plan.name === "Open WebUI"
                          ? "/integrations"
                          : signedIn
                            ? "/dashboard"
                            : "/auth"
                      }
                    >
                      {plan.cta}
                    </Link>
                  </Button>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-primary">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 text-center sm:py-16">
        <h2 className="text-xl font-semibold sm:text-2xl">
          {signedIn ? "Continue in Studio" : "Ready for your Open-Connect workspace?"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hub Studio · organizations · professional setup · role scopes — on open-connect.site.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild size="lg">
            <Link to={signedIn ? "/studio" : "/auth"}>
              {signedIn ? "Open Studio" : "Create account"}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/resources">Marketplace</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
