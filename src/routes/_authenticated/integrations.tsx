import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppWindow,
  Bell,
  Bot,
  Copy,
  KeyRound,
  ShieldCheck,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ApiKeysCard } from "@/components/api-keys-card";
import { AuthorizedAppsCard } from "@/components/authorized-apps-card";
import { IncomingWebhooks } from "@/components/incoming-webhooks";
import { NotificationChannels } from "@/components/notification-channels";
import { OAuthIntegrationsCard } from "@/components/oauth-integrations-card";
import { TelegramIntegrationCard } from "@/components/telegram-integration-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  developerSection,
  developerSections,
  type DeveloperSection,
} from "@/lib/settings-navigation";
import { cn } from "@/lib/utils";

type SectionMeta = { label: string; title: string; description: string; icon: LucideIcon };

const SECTIONS: Record<DeveloperSection, SectionMeta> = {
  "api-key": {
    label: "Personal tokens",
    title: "Personal tokens",
    description:
      "Scoped bearer tokens for scripts, CLIs, and MCP clients that do not support OAuth. Tokens act as you; grant only the scopes a client needs.",
    icon: KeyRound,
  },
  "oauth-apps": {
    label: "OAuth apps",
    title: "OAuth apps",
    description:
      "Apps you build that offer “Sign in with Open-Connect”. Register an app to get a client ID and client secret; users approve scopes on Open-Connect’s consent screen.",
    icon: AppWindow,
  },
  "authorized-apps": {
    label: "Authorized apps",
    title: "Authorized apps",
    description:
      "Apps you have allowed to access your account, such as ChatGPT, Claude, or a registered integration. Revoke access at any time.",
    icon: ShieldCheck,
  },
  webhooks: {
    label: "Webhooks",
    title: "Incoming webhooks",
    description:
      "Signed endpoints that let external systems trigger your Open-Connect automations. Each webhook has its own secret.",
    icon: Webhook,
  },
  apps: {
    label: "Apps & notifications",
    title: "Apps & notifications",
    description:
      "Account-owned apps such as a Telegram bot, and the channels Open-Connect uses to deliver alerts and notifications.",
    icon: Bell,
  },
};

const GROUPS: { heading: string; sections: DeveloperSection[] }[] = [
  { heading: "Access", sections: ["api-key", "oauth-apps", "authorized-apps"] },
  { heading: "Integrations", sections: ["webhooks", "apps"] },
];

export const Route = createFileRoute("/_authenticated/integrations")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: developerSection(search["section"]),
  }),
  head: () => ({
    meta: [
      { title: "Developer & integrations — Open-Connect" },
      {
        name: "description",
        content:
          "Personal tokens, OAuth apps, authorized apps, webhooks, and app notifications for Open-Connect.",
      },
    ],
  }),
  component: DeveloperPage,
});

const MCP_ENDPOINT = "https://open-connect.site/mcp";

function DeveloperPage() {
  const { user } = useAuth();
  const { section } = Route.useSearch();
  const meta = SECTIONS[section];
  const [mcpOpen, setMcpOpen] = useState(false);

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(MCP_ENDPOINT);
      toast.success("MCP endpoint copied");
    } catch {
      toast.error("Could not copy endpoint");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Developer &amp; integrations
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Manage how apps, scripts, and services access your account. To connect Open-Connect to
          another service, use{" "}
          <Link to="/connections" className="underline">
            Connections
          </Link>
          .
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Developer and integration settings"
          className="md:sticky md:top-6 md:self-start"
        >
          <div className="flex gap-6 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
            {GROUPS.map((group) => (
              <div key={group.heading} className="min-w-max md:min-w-0">
                <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.heading}
                </p>
                <ul className="flex gap-1 md:flex-col">
                  {group.sections.map((value) => {
                    const Icon = SECTIONS[value].icon;
                    const active = section === value;
                    return (
                      <li key={value}>
                        <Link
                          to="/integrations"
                          search={{ section: value }}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-accent font-medium text-foreground"
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          {SECTIONS[value].label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 space-y-6">
          <div>
            <h2 className="text-xl font-semibold">{meta.title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{meta.description}</p>
          </div>
          {user ? (
            <>
              <section id="api-key" hidden={section !== "api-key"} className="space-y-6">
                <ApiKeysCard />
                <Card className="shadow-panel">
                  <CardHeader className="p-5">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Bot className="size-5" />
                    </div>
                    <CardTitle className="mt-3 text-base">Open-Connect MCP endpoint</CardTitle>
                    <CardDescription>
                      Compatible clients connect here and receive only the capabilities allowed for
                      your account and project access.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-sm">
                        {MCP_ENDPOINT}
                      </code>
                      <Button variant="outline" size="sm" onClick={() => void copyEndpoint()}>
                        <Copy className="mr-2 size-4" />
                        Copy URL
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">OAuth supported</Badge>
                      <Badge variant="secondary">Bearer key supported</Badge>
                      <span className="self-center">
                        OAuth clients sign in and approve in their client.
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setMcpOpen(true)}>
                        Client setup instructions
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/integrations" search={{ section: "oauth-apps" }}>
                          Build an app with OAuth
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </section>
              <section id="oauth-apps" hidden={section !== "oauth-apps"}>
                {section === "oauth-apps" ? <OAuthIntegrationsCard /> : null}
              </section>
              <section id="authorized-apps" hidden={section !== "authorized-apps"}>
                {section === "authorized-apps" ? <AuthorizedAppsCard /> : null}
              </section>
              <section id="webhooks" hidden={section !== "webhooks"}>
                {section === "webhooks" ? <IncomingWebhooks userId={user.id} /> : null}
              </section>
              <section id="apps" hidden={section !== "apps"} className="space-y-6">
                {section === "apps" ? (
                  <>
                    <TelegramIntegrationCard />
                    <NotificationChannels userId={user.id} />
                  </>
                ) : null}
              </section>
            </>
          ) : null}
        </main>
      </div>

      <Dialog open={mcpOpen} onOpenChange={setMcpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect an MCP client</DialogTitle>
            <DialogDescription>
              Use the Open-Connect endpoint directly. This does not browse or install marketplace
              resources.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Server URL</p>
            <code className="block break-all rounded-md bg-muted p-3">{MCP_ENDPOINT}</code>
            <p className="text-muted-foreground">
              Use OAuth when supported. Otherwise create a narrowly scoped personal token and send
              it as a bearer token. Allow only the tools this client needs; write access is checked
              against the key scopes, connected account, and project grants.
            </p>
            <Button variant="outline" onClick={() => void copyEndpoint()}>
              <Copy className="mr-2 size-4" />
              Copy endpoint
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
