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
      { title: "Open-Connect — AI workspace for agents, MCP & skills" },
      {
        name: "description",
        content:
          "Calm AI workspace. Connect Open WebUI, ChatGPT, Claude, Grok. Studio, orgs, marketplace — GitHub + Cloudflare + Supabase.",
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
      { icon: LayoutDashboard, title: "Studio", body: "Create agents, skills, prompts, plugins", to: "/studio" as const },
      { icon: Building2, title: "Organizations", body: "Orgs and projects for your team", to: "/orgs" as const },
      { icon: Code2, title: "Coding agents", body: "MCP agents with scoped keys", to: "/agents" as const },
      { icon: FileCode, title: "Guides", body: "Professional E2E setup", to: "/guides" as const },
    ],
  },
  {
    group: "Integration",
    items: [
      { icon: MessageSquare, title: "Open WebUI", body: "Point base URL at /v1", to: "/integrations" as const },
      { icon: Plug, title: "Chat apps", body: "Slack · Discord · Telegram", to: "/connections" as const },
      { icon: Sparkles, title: "ChatGPT · Claude · Grok", body: "OAuth + MCP clients", to: "/integrations" as const },
      { icon: Boxes, title: "Marketplace", body: "Skills, MCP, tools, plugins", to: "/resources" as const },
    ],
  },
  {
    group: "Platform",
    items: [
      { icon: Terminal, title: "MCP gateway", body: "open-connect.site/mcp", to: "/integrations" as const },
      { icon: Sparkles, title: "Models /v1", body: "OpenAI-compatible", to: "/models" as const },
      { icon: Shield, title: "Role scopes", body: "user → owner", to: "/dashboard" as const },
      { icon: Wrench, title: "API keys", body: "Full autonomous scopes", to: "/api-keys" as const },
    ],
  },
];

const marketStats = [
  { label: "Agents", value: "MCP", hint: "Connect agents", to: "/agents" as const, icon: Bot },
  { label: "Gateway", value: "/mcp", hint: "One tools URL", to: "/integrations" as const, icon: Plug },
  { label: "Skills", value: "40+", hint: "Marketplace", to: "/resources" as const, icon: Boxes },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "Workspace starter",
    cta: "Get started",
    popular: false,
    features: [
      "Studio · agents & skills",
      "Marketplace (login to download)",
      "Open WebUI / Claude / Grok",
      "1 organization · projects",
      "Full-scope oc_live_ keys",
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
      "Pipedream · Composio · 1Password",
      "Secrets vault · toolkits",
      "Professional E2E guides",
    ],
  },
  {
    name: "Open WebUI",
    price: "Bring yours",
    period: "Point at open-connect.site",
    cta: "Integration guide",
    popular: false,
    features: [
      "Base URL → /v1",
      "API key → oc_live_…",
      "MCP → /mcp",
      "Model aliases open-connect/*",
      "Edge on Cloudflare Pages",
    ],
  },
];

function Home() {
  const { user, loading } = useAuth();
  const signedIn = Boolean(user);

  return (
    <div className="bg-background">
      {/* Desktop mega menu strip */}
      <section className="hidden border-b border-border/50 bg-surface/50 lg:block">
        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-8 px-6 py-8">
          {megaFeatures.map((col) => (
            <div key={col.group}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {col.group}
              </p>
              <ul className="mt-4 space-y-1">
                {col.items.map((item) => (
                  <li key={item.title}>
                    <Link
                      to={item.to}
                      className="flex gap-3 rounded-2xl p-2.5 transition-colors hover:bg-muted/60"
                    >
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
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

      {/* Mobile feature chips */}
      <section className="border-b border-border/50 lg:hidden">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
          {megaFeatures.flatMap((c) => c.items).slice(0, 6).map((item) => (
            <Link
              key={item.title}
              to={item.to}
              className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-2 text-xs font-medium shadow-sm"
            >
              <item.icon className="size-3.5 text-primary" />
              {item.title}
            </Link>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border/50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-stretch gap-3 px-4 py-5 sm:px-6 sm:py-6">
          {marketStats.map((s) => (
            <Link
              key={s.label}
              to={s.to}
              className="min-w-[7.5rem] flex-1 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-panel"
            >
              <s.icon className="size-4 text-primary" />
              <p className="mt-2.5 font-display text-xl font-semibold tabular-nums tracking-tight">
                {s.value}
              </p>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </Link>
          ))}
          <div className="flex min-w-[9rem] flex-1 flex-col justify-center gap-2 rounded-2xl border border-border/70 bg-card/80 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Stack
            </p>
            <div className="flex flex-wrap gap-2">
              {["github", "cloudflare", "supabase"].map((p) => (
                <BrandLogo key={p} provider={p} size="sm" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero" aria-hidden />
        <div className="absolute inset-0 grid-lines opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24 md:py-28">
          <Badge
            variant="outline"
            className="rounded-full border-primary/25 bg-card/60 px-3 py-1 text-primary shadow-sm"
          >
            open-connect.site
          </Badge>
          <h1 className="mt-6 font-display text-[2rem] leading-[1.15] tracking-tight sm:text-5xl md:text-[3.25rem]">
            Your team just needs an{" "}
            <span className="text-gradient">Open-Connect workspace</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Studio, organizations, and marketplace in one calm hub. Connect{" "}
            <strong className="font-medium text-foreground">Open WebUI</strong>, ChatGPT, Claude, and
            Grok through a single MCP URL and model gateway.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {loading ? null : signedIn ? (
              <>
                <Button asChild size="lg">
                  <Link to="/dashboard">
                    Open workspace <ArrowRight className="ml-0.5 size-4" />
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
                    Get started <ArrowRight className="ml-0.5 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/resources">Marketplace</Link>
                </Button>
              </>
            )}
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            GitHub · Cloudflare · Supabase · OpenRouter
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            {["github", "cloudflare", "supabase", "openai", "anthropic"].map((p) => (
              <BrandLogo key={p} provider={p} size="sm" />
            ))}
          </div>
        </div>
      </section>

      {/* Product story */}
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div className="text-left">
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
              One hub for your team's AI work
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Replace scattered keys and tools with Open-Connect: Studio to create, organizations to
              group work, marketplace to share skills, and role scopes so clients only get what they
              need.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="size-3.5 text-primary" />
                </span>
                <span>
                  Open WebUI → base URL{" "}
                  <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                    /v1
                  </code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Plug className="size-3.5 text-primary" />
                </span>
                <span>
                  MCP clients →{" "}
                  <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                    /mcp
                  </code>{" "}
                  + Bearer key
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="size-3.5 text-primary" />
                </span>
                <span>Login required to download agents & skills</span>
              </li>
            </ul>
          </div>
          <Card className="overflow-hidden rounded-3xl border-border/70 bg-pillar shadow-panel">
            <CardHeader className="p-6 pb-3">
              <CardTitle className="font-display text-lg">Open WebUI path</CardTitle>
              <CardDescription className="text-[13px] leading-relaxed">
                Point your instance at Open-Connect instead of a single vendor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 px-6 pb-6 font-mono text-xs">
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <span className="text-muted-foreground">OPENAI_API_BASE=</span>
                <span className="break-all text-primary">https://open-connect.site/v1</span>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <span className="text-muted-foreground">OPENAI_API_KEY=</span>
                <span className="text-primary">oc_live_…</span>
              </div>
              <Button asChild size="sm" className="mt-3 w-full">
                <Link to="/integrations">Full integration guide</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Plans */}
      <section className="border-t border-border/50 bg-surface/40">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="text-center">
            <Badge variant="secondary" className="rounded-full">
              Plans
            </Badge>
            <h2 className="mt-4 font-display text-2xl tracking-tight sm:text-3xl">
              Start free. Scale with roles.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Capability and role scopes — not a credit store.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.popular
                    ? "relative rounded-3xl border-primary/40 shadow-panel ring-1 ring-primary/20"
                    : "rounded-3xl shadow-sm"
                }
              >
                {plan.popular ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                ) : null}
                <CardHeader className="p-6 pb-2">
                  <CardTitle className="font-display text-lg">{plan.name}</CardTitle>
                  <p className="font-display text-2xl tracking-tight">{plan.price}</p>
                  <CardDescription>{plan.period}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-6 pb-6">
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
                  <ul className="space-y-2.5 text-xs leading-snug text-muted-foreground">
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

      {/* CTA */}
      <section className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="font-display text-xl tracking-tight sm:text-2xl">
          {signedIn ? "Continue in Studio" : "Ready for your workspace?"}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Hub Studio · organizations · professional setup — on open-connect.site.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
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
