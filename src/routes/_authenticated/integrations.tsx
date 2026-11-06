import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ApiKeysCard } from "@/components/api-keys-card";
import { AuthorizedAppsCard } from "@/components/authorized-apps-card";
import { OAuthIntegrationsCard } from "@/components/oauth-integrations-card";
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
import { cn } from "@/lib/utils";

const developerSections = ["api-key", "oauth-apps", "authorized-apps"] as const;
type DeveloperSection = (typeof developerSections)[number];

const SECTION_LABELS: Record<DeveloperSection, string> = {
  "api-key": "Personal tokens",
  "oauth-apps": "OAuth apps",
  "authorized-apps": "Authorized apps",
};

const SECTION_DESCRIPTIONS: Record<DeveloperSection, string> = {
  "api-key":
    "Scoped tokens for scripts and clients that use bearer authentication, plus the MCP endpoint.",
  "oauth-apps":
    "Apps you build that offer “Sign in with Open-Connect”. Register one to get a client ID and client secret.",
  "authorized-apps": "Apps you have allowed to access your account. Revoke access at any time.",
};

function parseDeveloperSection(value: unknown): DeveloperSection | "apps" {
  if (value === "apps") return "apps";
  return typeof value === "string" && developerSections.includes(value as DeveloperSection)
    ? (value as DeveloperSection)
    : "api-key";
}

export const Route = createFileRoute("/_authenticated/integrations")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: parseDeveloperSection(search["section"]),
  }),
  // Telegram and notification channels moved to Settings → Integrations.
  beforeLoad: ({ search }) => {
    if (search.section === "apps") throw redirect({ to: "/settings", hash: "integrations" });
  },
  head: () => ({
    meta: [
      { title: "Developer — Open-Connect" },
      {
        name: "description",
        content: "Personal tokens, OAuth apps, and authorized apps for Open-Connect.",
      },
    ],
  }),
  component: DeveloperPage,
});

const MCP_ENDPOINT = "https://open-connect.site/mcp";

function DeveloperPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const section: DeveloperSection = search.section === "apps" ? "api-key" : search.section;
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
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <Badge variant="outline" className="border-primary/40 text-primary">
          Open-Connect · developer
        </Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Developer
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {SECTION_DESCRIPTIONS[section]} To connect Open-Connect to another app with your own OAuth
          client ID and secret, add a connector in{" "}
          <Link to="/connections" className="underline">
            Connections
          </Link>
          .
        </p>
        <nav aria-label="Developer sections" className="mt-6 flex flex-wrap gap-2">
          {developerSections.map((value) => (
            <Link
              key={value}
              to="/integrations"
              search={{ section: value }}
              aria-current={section === value ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                section === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {SECTION_LABELS[value]}
            </Link>
          ))}
        </nav>
      </header>

      {user ? (
        <>
          <section id="api-key" hidden={section !== "api-key"} className="scroll-mt-6 space-y-6">
            <ApiKeysCard />
            <Card className="shadow-panel">
              <CardHeader className="p-5">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="size-5" />
                </div>
                <CardTitle className="mt-3 text-base">Open-Connect MCP endpoint</CardTitle>
                <CardDescription>
                  Compatible clients connect here and receive only the capabilities allowed for your
                  account and project access.
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
                      Register an OAuth integration
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
          <section id="oauth-apps" hidden={section !== "oauth-apps"} className="scroll-mt-6">
            {section === "oauth-apps" ? <OAuthIntegrationsCard /> : null}
          </section>
          <section
            id="authorized-apps"
            hidden={section !== "authorized-apps"}
            className="scroll-mt-6"
          >
            {section === "authorized-apps" ? <AuthorizedAppsCard /> : null}
          </section>
        </>
      ) : null}

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
              Use OAuth when supported. Otherwise create a narrowly scoped key under API keys and
              send it as a bearer token. Allow only the tools this client needs; write access is
              checked against the key scopes, connected account, and project grants.
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
