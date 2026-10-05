import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Bot,
  Copy,
  ExternalLink,
  ArrowLeft,
  KeyRound,
  Loader2,
  MessageCircle,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand-logo";
import { ApiKeysCard } from "@/components/api-keys-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  configureAppConnection,
  disconnectApp,
  listAppConnections,
} from "@/lib/connections.functions";
import {
  configureTelegramIntegration,
  deleteInboundIntegration,
  listInboundIntegrations,
} from "@/lib/inbound-integrations.functions";

const integrationSections = [
  "overview",
  "api-key",
  "apps",
  "ai-agents",
  "custom-mcp",
] as const;
type IntegrationSection = (typeof integrationSections)[number];

export const Route = createFileRoute("/_authenticated/integrations")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: integrationSections.includes(search.section as IntegrationSection)
      ? (search.section as IntegrationSection)
      : "overview",
  }),
  head: () => ({
    meta: [
      { title: "Integrations — Open-Connect" },
      {
        name: "description",
        content:
          "Manage separate API Key, Apps, AI Agents, and Custom MCP integrations for Open-Connect.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const MCP_ENDPOINT = "https://open-connect.site/mcp";

const aiClients = [
  {
    provider: "chatgpt",
    name: "ChatGPT",
    description:
      "Connect ChatGPT using OAuth. ChatGPT signs in and requests approval when it connects.",
    action: "Connect with OAuth",
  },
  {
    provider: "claude",
    name: "Claude",
    description:
      "Connect a compatible Claude client to your Open-Connect MCP server.",
    action: "View MCP setup",
  },
  {
    provider: "openwebui",
    name: "Open WebUI",
    description: "Connect your own Open WebUI client with a scoped key.",
    action: "View MCP setup",
  },
  {
    provider: "hermes",
    name: "Hermes Agent",
    description:
      "Give your agent access to tools allowed for your account and projects.",
    action: "View MCP setup",
  },
  {
    provider: "manus",
    name: "Manus",
    description:
      "Connect a supported agent through the Open-Connect MCP endpoint.",
    action: "View MCP setup",
  },
];

function IntegrationsPage() {
  const { section: integrationSection } = Route.useSearch();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listInboundIntegrations);
  const configureFn = useServerFn(configureTelegramIntegration);
  const disconnectFn = useServerFn(deleteInboundIntegration);
  const customMcpListFn = useServerFn(listAppConnections);
  const customMcpConfigureFn = useServerFn(configureAppConnection);
  const customMcpDisconnectFn = useServerFn(disconnectApp);
  const [oauthOpen, setOauthOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [botLabel, setBotLabel] = useState("");
  const [botToken, setBotToken] = useState("");
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpAuthType, setMcpAuthType] = useState<
    "none" | "bearer" | "api_key" | "personal_access_token"
  >("none");
  const [mcpCredential, setMcpCredential] = useState("");

  const connections = useQuery({
    queryKey: ["inbound-integrations"],
    queryFn: () => listFn({}),
    enabled: Boolean(user) && integrationSection === "apps",
  });

  const telegramItems = (connections.data ?? []).filter(
    (item) => item.provider === "telegram",
  );

  const customMcpConnections = useQuery({
    queryKey: ["app-connections"],
    queryFn: () => customMcpListFn({}),
    enabled: Boolean(user) && integrationSection === "custom-mcp",
  });
  const customMcpItems = (customMcpConnections.data ?? []).filter(
    (item) => item.provider === "custom_mcp",
  );

  const saveTelegram = useMutation({
    mutationFn: () =>
      configureFn({
        data: {
          display_name: botLabel.trim() || "Telegram bot",
          token: botToken,
        },
      }),
    onSuccess: (result) => {
      toast.success("Telegram bot verified and saved securely");
      setBotLabel("");
      setBotToken("");
      setTelegramOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ["inbound-integrations"],
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not set up Telegram",
      ),
  });

  const removeTelegram = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Telegram integration removed");
      void queryClient.invalidateQueries({
        queryKey: ["inbound-integrations"],
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not remove Telegram",
      ),
  });

  const saveCustomMcp = useMutation({
    mutationFn: () =>
      customMcpConfigureFn({
        data: {
          provider: "custom_mcp",
          display_name: mcpName.trim() || "Custom MCP server",
          account_label: mcpName.trim() || mcpUrl.trim(),
          endpoint_url: mcpUrl.trim(),
          api_key: mcpCredential,
          auth_type: mcpAuthType,
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.validation.verified
          ? "MCP server verified and saved"
          : "MCP server saved for review",
      );
      setMcpName("");
      setMcpUrl("");
      setMcpCredential("");
      setMcpAuthType("none");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not save MCP server",
      ),
  });

  const removeCustomMcp = useMutation({
    mutationFn: (id: string) => customMcpDisconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Custom MCP server removed");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not remove MCP server",
      ),
  });

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(MCP_ENDPOINT);
      toast.success("MCP endpoint copied");
    } catch {
      toast.error("Could not copy endpoint");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <Badge variant="outline" className="border-primary/40 text-primary">
          Open-Connect · inbound
        </Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {integrationSection === "overview"
            ? "Integrations"
            : integrationSection === "api-key"
              ? "API Key"
              : integrationSection === "apps"
                ? "Apps"
                : integrationSection === "ai-agents"
                  ? "AI Agents"
                  : "Custom MCP"}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {integrationSection === "overview"
            ? "Choose an integration type to manage it on its own page."
            : "Manage this integration type separately from Connectors, AI Gateway, and Marketplace resources."}
        </p>
      </header>

      {integrationSection === "overview" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <IntegrationTypeCard
            section="api-key"
            icon={KeyRound}
            title="API Key"
            description="Create and manage scoped keys for clients that use bearer authentication."
          />
          <IntegrationTypeCard
            section="apps"
            icon={MessageCircle}
            title="Apps"
            description="Connect account-owned apps such as Telegram and manage their credentials."
          />
          <IntegrationTypeCard
            section="ai-agents"
            icon={Bot}
            title="AI Agents"
            description="Set up clients such as ChatGPT with their dedicated OAuth or MCP connection flow."
          />
          <IntegrationTypeCard
            section="custom-mcp"
            icon={Server}
            title="Custom MCP"
            description="Add and manage remote MCP servers separately from Connectors and Marketplace resources."
          />
        </div>
      ) : (
        <div className="space-y-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/integrations" search={{ section: "overview" }}>
              <ArrowLeft className="mr-2 size-4" />
              All integrations
            </Link>
          </Button>
          {integrationSection === "api-key" && (
            <section id="api-key" className="scroll-mt-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">API Key</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create and revoke scoped keys for clients that use bearer
                  authentication. ChatGPT uses OAuth and does not need an API
                  key.
                </p>
              </div>
              <ApiKeysCard />
            </section>
          )}
          {integrationSection === "apps" && (
            <section id="apps" className="scroll-mt-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Apps</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set up your bot for agent messaging. This is an Open-Connect
                  integration, separate from app connectors.
                </p>
              </div>
              <Card className="shadow-panel">
                <CardHeader className="p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessageCircle className="size-5" />
                  </div>
                  <CardTitle className="mt-3 text-base">Telegram bot</CardTitle>
                  <CardDescription>
                    Your bot token is stored securely for your account and is
                    never displayed to collaborators.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <div className="space-y-2">
                    {telegramItems.length ? (
                      telegramItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                        >
                          <span>
                            {item.display_name || "Telegram"} ·{" "}
                            {item.status.replaceAll("_", " ")}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={removeTelegram.isPending}
                            onClick={() => removeTelegram.mutate(item.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No Telegram bot is connected to this account.
                      </p>
                    )}
                  </div>
                  {user ? (
                    <Button size="sm" onClick={() => setTelegramOpen(true)}>
                      <MessageCircle className="mr-2 size-4" />
                      Set up Telegram
                    </Button>
                  ) : (
                    <Button asChild size="sm">
                      <Link to="/auth">Sign in</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </section>
          )}
          {integrationSection === "ai-agents" && (
            <section id="ai-agents" className="scroll-mt-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">AI Agents</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a client to see its own connection flow.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {aiClients.map((client) => (
                  <Card key={client.provider} className="shadow-panel">
                    <CardHeader className="p-4">
                      <BrandLogo
                        provider={client.provider}
                        name={client.name}
                        size="lg"
                      />
                      <CardTitle className="mt-3 text-sm">
                        {client.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {client.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {user ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() =>
                            client.provider === "chatgpt"
                              ? setOauthOpen(true)
                              : setMcpOpen(true)
                          }
                        >
                          {client.provider === "chatgpt" ? (
                            <ShieldCheck className="mr-2 size-4" />
                          ) : (
                            <Bot className="mr-2 size-4" />
                          )}
                          {client.action}
                        </Button>
                      ) : (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="w-full"
                        >
                          <Link to="/auth">Sign in</Link>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {integrationSection === "custom-mcp" && (
            <section id="custom-mcp" className="scroll-mt-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Custom MCP</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage account-owned remote MCP servers and the inbound
                  endpoint AI clients use. These stay separate from app
                  Connectors and Marketplace resources.
                </p>
              </div>
              <Card className="shadow-panel">
                <CardHeader className="p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Server className="size-5" />
                  </div>
                  <CardTitle className="mt-3 text-base">
                    Remote MCP servers
                  </CardTitle>
                  <CardDescription>
                    Add a remote MCP endpoint for your account. Any credential
                    is validated and stored in the secure vault.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="mcp-name">Name</Label>
                      <Input
                        id="mcp-name"
                        value={mcpName}
                        onChange={(event) => setMcpName(event.target.value)}
                        placeholder="Team MCP server"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mcp-url">Server URL</Label>
                      <Input
                        id="mcp-url"
                        type="url"
                        value={mcpUrl}
                        onChange={(event) => setMcpUrl(event.target.value)}
                        placeholder="https://mcp.example.com/mcp"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mcp-auth-type">Authentication</Label>
                      <select
                        id="mcp-auth-type"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={mcpAuthType}
                        onChange={(event) =>
                          setMcpAuthType(
                            event.target.value as typeof mcpAuthType,
                          )
                        }
                      >
                        <option value="none">No authentication</option>
                        <option value="bearer">Bearer token</option>
                        <option value="api_key">API key</option>
                        <option value="personal_access_token">
                          Personal access token
                        </option>
                      </select>
                    </div>
                    {mcpAuthType !== "none" ? (
                      <div className="space-y-2">
                        <Label htmlFor="mcp-credential">Credential</Label>
                        <Input
                          id="mcp-credential"
                          type="password"
                          autoComplete="new-password"
                          value={mcpCredential}
                          onChange={(event) =>
                            setMcpCredential(event.target.value)
                          }
                          placeholder="Paste credential"
                        />
                      </div>
                    ) : null}
                  </div>
                  <Button
                    disabled={
                      saveCustomMcp.isPending ||
                      !mcpUrl.trim() ||
                      (mcpAuthType !== "none" &&
                        mcpCredential.trim().length < 8)
                    }
                    onClick={() => saveCustomMcp.mutate()}
                  >
                    {saveCustomMcp.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Server className="mr-2 size-4" />
                    )}
                    Add remote MCP server
                  </Button>
                  {customMcpItems.length ? (
                    <div className="space-y-2 border-t pt-4">
                      {customMcpItems.map((item) => {
                        const metadata = (item.metadata ?? {}) as Record<
                          string,
                          unknown
                        >;
                        return (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">{item.display_name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {String(metadata.endpoint_url ?? "")} ·{" "}
                                {item.status.replaceAll("_", " ")}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={removeCustomMcp.isPending}
                              onClick={() => removeCustomMcp.mutate(item.id)}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No remote MCP servers are configured.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-panel">
                <CardHeader className="p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bot className="size-5" />
                  </div>
                  <CardTitle className="mt-3 text-base">
                    Open-Connect MCP endpoint
                  </CardTitle>
                  <CardDescription>
                    Compatible clients connect here and receive only the
                    capabilities allowed for your account and project access.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-sm">
                      {MCP_ENDPOINT}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copyEndpoint()}
                    >
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMcpOpen(true)}
                  >
                    Client setup instructions
                  </Button>
                </CardContent>
              </Card>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Integrations belong to the signed-in account by default. Grant
            project access explicitly. Connector accounts, model provider keys,
            and resource catalog entries remain separate.
          </p>
        </div>
      )}

      <Dialog open={oauthOpen} onOpenChange={setOauthOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect ChatGPT with OAuth</DialogTitle>
            <DialogDescription>
              ChatGPT starts the OAuth request and Open-Connect shows sign-in
              and consent when the client connects. No API key is needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>
                Open ChatGPT Settings, then Apps or Connectors, and add a custom
                MCP server.
              </li>
              <li>
                Paste the server URL:{" "}
                <code className="break-all text-primary">{MCP_ENDPOINT}</code>
              </li>
              <li>
                Choose OAuth and finish sign-in and approval when ChatGPT
                redirects to Open-Connect.
              </li>
            </ol>
            <Button asChild className="w-full">
              <a href="https://chatgpt.com" target="_blank" rel="noreferrer">
                Open ChatGPT <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mcpOpen} onOpenChange={setMcpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect an MCP client</DialogTitle>
            <DialogDescription>
              Use the Open-Connect endpoint directly. This does not browse or
              install marketplace resources.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Server URL</p>
            <code className="block break-all rounded-md bg-muted p-3">
              {MCP_ENDPOINT}
            </code>
            <p className="text-muted-foreground">
              Use OAuth when supported. Otherwise create a narrowly scoped key
              under API keys and send it as a bearer token.
            </p>
            <Button variant="outline" onClick={() => void copyEndpoint()}>
              <Copy className="mr-2 size-4" />
              Copy endpoint
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={telegramOpen}
        onOpenChange={(open) => {
          setTelegramOpen(open);
          if (!open) {
            setBotToken("");
            setBotLabel("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up Telegram</DialogTitle>
            <DialogDescription>
              Create a bot with Telegram’s BotFather, then add its token here.
              The token is stored in the secure credential vault.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-label">Bot name</Label>
              <Input
                id="telegram-label"
                value={botLabel}
                onChange={(event) => setBotLabel(event.target.value)}
                placeholder="Support bot"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Bot token</Label>
              <Input
                id="telegram-token"
                type="password"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder="Paste token from BotFather"
                autoComplete="new-password"
              />
            </div>
            <Button
              className="w-full"
              disabled={saveTelegram.isPending || botToken.trim().length < 8}
              onClick={() => saveTelegram.mutate()}
            >
              {saveTelegram.isPending
                ? "Verifying and saving…"
                : "Save Telegram integration"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IntegrationTypeCard({
  section,
  icon: Icon,
  title,
  description,
}: {
  section: Exclude<IntegrationSection, "overview">;
  icon: typeof Server;
  title: string;
  description: string;
}) {
  return (
    <Link
      to="/integrations"
      search={{ section }}
      className="block rounded-xl border bg-card p-5 shadow-panel transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
  );
}
