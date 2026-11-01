import { modelProviderState } from "@/lib/model-provider-state";
import { ApiKeysCard } from "@/components/api-keys-card";
import { testFreeModel } from "@/lib/model-check.functions";
import { startAiProviderSignIn } from "@/lib/ai-provider-signin.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  List,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import {
  configureAppConnection,
  disconnectApp,
  listAppConnections,
  syncComposioConnections,
  testAiProviderCredential,
} from "@/lib/connections.functions";
import { listFreeModels } from "@/lib/model-catalog.functions";
import { AI_GATEWAY_PROVIDERS, AI_GATEWAY_PROVIDER_IDS } from "@/lib/ai-gateway-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/models")({
  head: () => ({
    meta: [
      { title: "AI Gateway — Open-Connect" },
      {
        name: "description",
        content:
          "One OpenAI-compatible gateway for OpenRouter, OpenAI, Claude, Gemini, Grok and more. List every model with your sk-oc- API Key.",
      },
    ],
  }),
  component: ModelsPage,
});

const aliases = [
  { alias: "open-connect/auto", body: "Free-first · rotates on limits · paid fallback" },
  { alias: "open-connect/high", body: "Flagship quality · gpt-4o" },
  { alias: "open-connect/deep", body: "Extended reasoning · o3-mini" },
  { alias: "open-connect/wide", body: "Multi-provider breadth · openrouter/auto" },
  { alias: "open-connect/fast", body: "Low latency · gpt-4o-mini" },
  { alias: "open-connect/coding", body: "Code · gpt-4o" },
  { alias: "open-connect/reasoning", body: "Reasoning · gpt-4o" },
  { alias: "open-connect/claude", body: "Claude Sonnet via OpenRouter" },
  { alias: "open-connect/gemini", body: "Gemini 2.5 Flash" },
  { alias: "open-connect/vision", body: "Multimodal · gpt-4o" },
  { alias: "gpt-4o", body: "OpenAI GPT-4o" },
  { alias: "claude-sonnet", body: "Anthropic Claude Sonnet" },
  { alias: "gemini-flash", body: "Google Gemini Flash" },
  { alias: "grok-2", body: "xAI Grok" },
];
const gatewayProviders = AI_GATEWAY_PROVIDER_IDS;

const gatewayTools = [
  {
    id: "openrouter:advisor",
    name: "Advisor",
    group: "Multi-model",
    detail: "Consults a stronger advisor model mid-generation with the conversation so far.",
  },
  {
    id: "openrouter:subagent",
    name: "Subagent",
    group: "Multi-model",
    detail: "Delegates sub-tasks to a smaller, faster worker model with the task content.",
  },
  {
    id: "openrouter:fusion",
    name: "Fusion",
    group: "Multi-model",
    detail: "Runs a panel of models plus an analyst over the request.",
  },
  {
    id: "openrouter:shell",
    name: "Shell",
    group: "Code execution",
    detail: "Hosted shell for the Responses and Messages APIs, sandboxed container.",
  },
  {
    id: "openrouter:bash",
    name: "Bash",
    group: "Code execution",
    detail: "Runs model-authored shell commands in an isolated sandbox container.",
  },
  {
    id: "openrouter:apply_patch",
    name: "Apply Patch",
    group: "Files and editing",
    detail: "Proposes file edits as V4A diff patches for your application to apply.",
  },
  {
    id: "openrouter:image_generation",
    name: "Image Generation",
    group: "Utilities",
    detail: "Generates images from a model-supplied prompt, routed to an image model.",
  },
  {
    id: "openrouter:datetime",
    name: "Datetime",
    group: "Utilities",
    detail: "Gives the model the current date and time. Runs entirely on OpenRouter.",
  },
  {
    id: "openrouter:tool_search",
    name: "Tool Search",
    group: "Utilities",
    detail: "Loads your own tool definitions on demand instead of up front.",
  },
  {
    id: "openrouter:experimental__search_models",
    name: "Search Models",
    group: "Utilities",
    detail: "Searches the OpenRouter model catalog. Experimental.",
  },
];

const featuredModels = [
  {
    id: "gpt-4o",
    name: "OpenAI GPT-4o",
    tags: ["Chat", "Multi-Modal", "Tool Calling", "JSON Mode"],
  },
  {
    id: "gpt-4o-mini",
    name: "OpenAI GPT-4o mini",
    tags: ["Chat", "Tool Calling", "JSON Mode", "Fast"],
  },
  {
    id: "claude-sonnet",
    name: "Anthropic Claude Sonnet",
    tags: ["Chat", "Tool Calling", "Coding"],
  },
  { id: "gemini-flash", name: "Google Gemini Flash", tags: ["Chat", "Multi-Modal", "Fast"] },
  { id: "grok-2", name: "xAI Grok 2", tags: ["Chat", "Tool Calling"] },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    tags: ["Chat", "Tool Calling", "Coding", "JSON Mode"],
  },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner", tags: ["Chat", "Reasoning", "Coding"] },
  { id: "open-connect/coding", name: "Managed coding alias", tags: ["Coding", "Tool Calling"] },
  { id: "open-connect/reasoning", name: "Managed reasoning alias", tags: ["Reasoning"] },
  { id: "open-connect/vision", name: "Managed vision alias", tags: ["Multi-Modal"] },
];

function copyToClipboard(value: string, label: string) {
  void navigator.clipboard?.writeText(value).then(
    () => toast.success(label + " copied to clipboard"),
    () => toast.error("Could not copy to clipboard"),
  );
}

function ModelsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const testFn = useServerFn(testFreeModel);
  const modelTest = useMutation({
    mutationFn: () => testFn({}),
  });
  const listFn = useServerFn(listAppConnections);
  const freeModelsFn = useServerFn(listFreeModels);
  const configureFn = useServerFn(configureAppConnection);
  const testProviderFn = useServerFn(testAiProviderCredential);
  const providerTest = useMutation({
    mutationFn: (input: { provider: string; api_key: string; endpoint_url?: string }) =>
      testProviderFn({ data: input }),
  });
  const signInFn = useServerFn(startAiProviderSignIn);
  const providerSignIn = useMutation({
    mutationFn: (provider: string) => signInFn({ data: { provider } }),
    onSuccess: (result) => {
      window.open(result.authorization_url, "_blank", "noopener");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Subscription sign-in unavailable"),
  });
  const { isAdmin } = useRoles();
  const syncComposioFn = useServerFn(syncComposioConnections);
  const composioSync = useMutation({
    mutationFn: () => syncComposioFn({}),
    onSuccess: (result) => {
      toast.success(
        result.matched
          ? `${result.imported} Composio accounts synced; ${result.existing} already linked`
          : "No authorized Composio accounts match your Open-Connect user.",
      );
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["free-model-catalog"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Composio sync failed"),
  });
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [aliasesOpen, setAliasesOpen] = useState(false);
  const [modelsListOpen, setModelsListOpen] = useState(false);
  const [freeListOpen, setFreeListOpen] = useState(false);
  const [allModelsOpen, setAllModelsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const disconnectFn = useServerFn(disconnectApp);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("AI Gateway");
  const [providerKey, setProviderKey] = useState("");
  const [providerUrl, setProviderUrl] = useState("");
  const connections = useQuery({
    queryKey: ["app-connections"],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
  });
  const freeModels = useQuery({
    queryKey: ["free-model-catalog", user?.id],
    queryFn: () => freeModelsFn({}),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  const reconnectProviders = new Set(
    AI_GATEWAY_PROVIDERS.filter(
      (provider) => modelProviderState(connections.data ?? [], provider.id).needsReconnect,
    ).map((provider) => provider.id),
  );
  function openProvider(provider: (typeof AI_GATEWAY_PROVIDERS)[number], id: string | null = null) {
    const account = (connections.data ?? []).find((item) => item.id === id);
    providerTest.reset();
    setActiveProvider(provider.id);
    setConnectionId(id);
    setAccountLabel(account?.identity.label || "AI Gateway");
    setProviderUrl(account?.metadata.endpoint_url || provider.baseUrl);
    setProviderKey("");
  }
  const removeConnection = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["free-model-catalog"] });
      modelTest.reset();
      toast.success("Provider account disconnected");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not disconnect"),
  });
  const configureMutation = useMutation({
    mutationFn: () => {
      const provider = AI_GATEWAY_PROVIDERS.find((item) => item.id === activeProvider);
      if (!provider) throw new Error("Choose an AI provider");
      return configureFn({
        data: {
          ...(connectionId ? { connection_id: connectionId } : {}),
          new_account: !connectionId,
          provider: provider.id,
          display_name: provider.name,
          account_label: accountLabel.trim() || "AI Gateway",
          endpoint_url: providerUrl || provider.baseUrl,
          api_key: providerKey,
          auth_type: "api_key",
        },
      });
    },
    onSuccess: () => {
      toast.success("AI provider connected");
      modelTest.reset();
      setConnectionId(null);
      setActiveProvider(null);
      setProviderKey("");
      setProviderUrl("");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["free-model-catalog"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Provider setup failed"),
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        Internal · Multi-provider gateway
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-3xl">AI Gateway</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        One gateway for OpenAI, Claude, Gemini, Grok and the full OpenRouter catalog. Auto routing
        uses free models first, rotates automatically when limits are hit, and falls back to paid or
        subscription models. Provider secrets stay on the server; clients only use an Open-Connect
        key.
      </p>

      <div className="mt-8">
        <ApiKeysCard modelOnly />
      </div>

      <Card className="mt-6 shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Point any client here</CardTitle>
          <CardDescription>
            Open WebUI, LobeHub, Cursor, custom agents — same OpenAI-compatible API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs">
            <span className="min-w-0 flex-1 break-all">
              <span className="text-muted-foreground">Base URL </span>
              <span className="text-primary">https://open-connect.site/v1</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 shrink-0 px-2 text-[11px]"
              title="Copy base URL"
              onClick={() => copyToClipboard("https://open-connect.site/v1", "Base URL")}
            >
              <Copy className="size-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs">
            <span className="min-w-0 flex-1 break-all">
              <span className="text-muted-foreground">API Key </span>
              <span className="text-accent">sk-oc-…</span>
              <span className="ml-2 text-muted-foreground">(create above)</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Full model list</h2>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={modelsListOpen}
          onClick={() => setModelsListOpen((open) => !open)}
        >
          {modelsListOpen ? (
            <ChevronUp className="mr-1 size-4" />
          ) : (
            <ChevronDown className="mr-1 size-4" />
          )}
          {modelsListOpen ? "Hide" : "Show"}
        </Button>
      </div>
      {modelsListOpen ? (
        <Card className="mt-3 shadow-panel">
          <CardContent className="space-y-3 pt-4">
            <div>
              <p className="mb-2 text-xs font-semibold">Featured models</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {featuredModels.map((model) => (
                  <div key={model.id} className="rounded-lg border border-border/70 px-2.5 py-2">
                    <p className="break-all font-mono text-xs text-primary">{model.id}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {model.name}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {model.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The complete catalog is dynamic: authenticated GET /v1/models returns the managed
              aliases above plus every model available through your connected providers, free and
              paid, in real time.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
              {`curl -sS https://open-connect.site/v1/models \\
  -H "Authorization: Bearer sk-oc-YOUR_KEY"`}
            </pre>
            <p className="text-xs text-muted-foreground">
              Authenticated GET /v1/models returns managed aliases plus every model from the
              connected OpenRouter credential (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek,
              xAI, …). Use the OpenAI-compatible provider setting and the base URL above. An
              Open-Connect key works at this gateway, not directly at OpenAI or a separate LiteLLM
              server. If LiteLLM reports token_not_found_in_db, verify the client base URL and
              reconnect LiteLLM below using a key issued by that LiteLLM server. Renaming a key does
              not register it there.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Gateway tools</h2>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((open) => !open)}
        >
          {toolsOpen ? (
            <ChevronUp className="mr-1 size-4" />
          ) : (
            <ChevronDown className="mr-1 size-4" />
          )}
          {toolsOpen ? "Hide" : "Show"}
        </Button>
      </div>
      {toolsOpen ? (
        <Card className="mt-3 shadow-panel">
          <CardContent className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">
              Built-in tool calls available to models routed through the OpenRouter upstream. Tools
              are grouped by capability and pass through the gateway like any other
              OpenAI-compatible tool call.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {gatewayTools.map((tool) => (
                <div key={tool.id} className="rounded-lg border border-border/70 px-2.5 py-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate font-mono text-xs text-primary">
                      {tool.id}
                    </p>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {tool.group}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{tool.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6 shadow-panel" id="free-models">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <List className="size-4" /> Free models · Auto default
              </CardTitle>
              <CardDescription className="mt-1 max-w-3xl">
                Use <span className="font-mono text-primary">open-connect/auto</span> for all
                projects and clients. It routes through your connected OpenRouter free-model router,
                then tries only provider free endpoints, Ollama free-plan models, and LiteLLM models
                explicitly priced at zero. The list refreshes automatically every minute; other
                connected models appear below and may cost money according to the provider.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={modelTest.isPending} onClick={() => modelTest.mutate()}>
                {modelTest.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Test
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void freeModels.refetch()}
                disabled={freeModels.isFetching || !user}
              >
                {freeModels.isFetching ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Refresh list
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {modelTest.data ? (
            <p role="status" className="mb-3 text-xs text-emerald-600 dark:text-emerald-400">
              Inference verified: {modelTest.data.model}
            </p>
          ) : null}
          {modelTest.error ? (
            <p role="alert" className="mb-3 text-xs text-destructive">
              {modelTest.error.message}
            </p>
          ) : null}
          {!user ? (
            <p className="text-sm text-muted-foreground">
              Sign in to view your connected free models.
            </p>
          ) : freeModels.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your free model catalog…</p>
          ) : freeModels.error ? (
            <p role="alert" className="text-sm text-destructive">
              {freeModels.error.message}
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Auto · open-connect/auto</Badge>
                {(freeModels.data?.providers ?? []).map((provider) => (
                  <Badge key={provider} variant="outline">
                    {provider}
                  </Badge>
                ))}
              </div>
              {freeModels.data?.models.length ? (
                <div>
                  <button
                    type="button"
                    aria-expanded={freeListOpen}
                    onClick={() => setFreeListOpen((open) => !open)}
                    className="mb-2 flex w-full items-center gap-1.5 text-left text-sm font-semibold"
                  >
                    {freeListOpen ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                    Free models
                    <span className="text-xs font-normal text-muted-foreground">
                      ({freeModels.data.models.length})
                    </span>
                  </button>
                  {freeListOpen ? (
                    <div className="max-h-80 overflow-auto rounded-lg border border-border/70">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>Model</span>
                        <span>Provider</span>
                        <span>Catalog</span>
                      </div>
                      {freeModels.data.models.map((model) => (
                        <div
                          key={`${model.source}:${model.id}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0"
                        >
                          <span className="break-all font-mono text-xs">{model.id}</span>
                          <span className="text-xs text-muted-foreground">{model.provider}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {
                              {
                                openrouter: "OpenRouter",
                                litellm: "LiteLLM",
                                nvidia: "NVIDIA",
                                ollama_cloud: "Ollama Cloud",
                              }[model.source]
                            }
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {reconnectProviders.size > 0
                    ? `A connected gateway is missing its saved credential reference (${[
                        ...reconnectProviders,
                      ].join(", ")}). Reconnect its credential below, then refresh the list.`
                    : "No individually priced free models were found. Auto still uses the OpenRouter free router when that connection is available. Connect OpenRouter or configure free pricing on your LiteLLM proxy, then refresh."}
                </p>
              )}
            </>
          )}
          {freeModels.data?.allModels.length ? (
            <div className="mt-5">
              <button
                type="button"
                aria-expanded={allModelsOpen}
                onClick={() => setAllModelsOpen((open) => !open)}
                className="mb-2 flex w-full items-center gap-1.5 text-left text-sm font-semibold"
              >
                {allModelsOpen ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                All connected models
                <span className="text-xs font-normal text-muted-foreground">
                  ({freeModels.data.allModels.length})
                </span>
              </button>
              {allModelsOpen ? (
                <div className="max-h-96 overflow-auto rounded-lg border border-border/70">
                  {freeModels.data.allModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 break-all font-mono text-xs">{model.id}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {model.owner}
                      </Badge>
                      <Badge
                        variant={model.free ? "secondary" : "outline"}
                        className="shrink-0 text-[10px]"
                      >
                        {model.free ? "Auto · free eligible" : "Connected · check provider pricing"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-10 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Stable aliases</h2>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={aliasesOpen}
          onClick={() => setAliasesOpen((open) => !open)}
        >
          {aliasesOpen ? (
            <ChevronUp className="mr-1 size-4" />
          ) : (
            <ChevronDown className="mr-1 size-4" />
          )}
          {aliasesOpen ? "Hide" : "Show"}
        </Button>
      </div>
      {aliasesOpen ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {aliases.map((item) => (
            <Card key={item.alias} className="p-4">
              <p className="font-mono text-sm text-primary">{item.alias}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">AI provider credentials</h2>
        {user && isAdmin ? (
          <Button
            size="sm"
            variant="outline"
            disabled={composioSync.isPending}
            onClick={() => composioSync.mutate()}
            title="Import accounts already connected in Composio into Open-Connect"
          >
            {composioSync.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            {composioSync.isPending ? "Syncing…" : "Sync from Composio"}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Connect compatible model APIs here to load their model catalogs into the gateway. Connected
        providers are fetched in real time, free and paid. Auto uses only provider models explicitly
        marked free or configured at zero cost first, then rotates to other models automatically
        when limits are hit; named paid models remain available through the gateway and follow the
        provider's billing. Accounts already connected in Composio are imported with Sync from
        Composio; provider API keys are added directly on each card.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {AI_GATEWAY_PROVIDERS.map((provider) => {
          const providerState = modelProviderState(connections.data ?? [], provider.id);
          return (
            <Card key={provider.id} className="flex flex-col gap-1.5 p-2">
              <div className="flex min-w-0 items-center gap-2">
                <BrandLogo provider={provider.id} name={provider.name} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug">
                  {provider.name}
                </p>
                {provider.official ? (
                  <Badge variant="outline" className="shrink-0 text-[10px] text-primary">
                    <BadgeCheck className="mr-1 size-3" /> Official
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {providerState.accounts.length ? (
                  <>
                    {providerState.accounts.length} account
                    {providerState.accounts.length === 1 ? "" : "s"} · {providerState.ready.length}{" "}
                    ready
                  </>
                ) : (
                  "No accounts · add an API key or sign in"
                )}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {provider.id === "openai" || provider.id === "anthropic" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-[11px]"
                    disabled={!user || providerSignIn.isPending}
                    onClick={() => providerSignIn.mutate(provider.id)}
                    title="Sign in with your provider account to use subscription models"
                  >
                    {providerSignIn.isPending ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : null}
                    {provider.id === "openai" ? "Sign in · ChatGPT" : "Sign in · Claude"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-[11px]"
                  disabled={!user || configureMutation.isPending || providerTest.isPending}
                  onClick={() => openProvider(provider)}
                >
                  Add account
                </Button>
              </div>
              {provider.id === "anthropic" ? (
                <p className="text-[11px] text-muted-foreground">
                  Native Anthropic credential validation. Use an OpenAI-compatible router for Claude
                  chat through /v1.
                </p>
              ) : null}
              {provider.id === "openai" || provider.id === "anthropic" ? (
                <p className="text-[11px] text-muted-foreground">
                  Sign in uses your ChatGPT / Claude subscription once the provider OAuth app is
                  configured. API key accounts stay fully supported.
                </p>
              ) : null}
              {providerState.accounts.length ? (
                <div className="space-y-1.5">
                  {providerState.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="space-y-1 rounded-lg border border-border/70 px-2 py-1.5"
                    >
                      <p className="truncate text-xs font-medium">
                        {account.identity.label ||
                          account.identity.email ||
                          account.identity.login ||
                          account.display_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={account.gateway_ready ? "secondary" : "outline"}
                          className="shrink-0 text-[10px]"
                        >
                          {account.gateway_ready ? (
                            <>
                              <CheckCircle2 className="mr-1 size-3" />{" "}
                              {provider.id === "anthropic" ? "Verified" : "Ready"}
                            </>
                          ) : account.status === "disconnected" ? (
                            "Disconnected"
                          ) : (
                            "Reconnect required"
                          )}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 shrink-0 px-2 text-[11px]"
                          disabled={configureMutation.isPending}
                          onClick={() => openProvider(provider, account.id)}
                        >
                          Reconnect
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 px-2 text-[11px]"
                          disabled={removeConnection.isPending || configureMutation.isPending}
                          onClick={() => removeConnection.mutate(account.id)}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {activeProvider === provider.id ? (
                <div className="space-y-2 border-t border-border/70 pt-2">
                  <div className="space-y-1">
                    <Label htmlFor={"account-label-" + provider.id} className="text-xs">
                      Account label
                    </Label>
                    <Input
                      id={"account-label-" + provider.id}
                      className="h-8 text-xs"
                      value={accountLabel}
                      onChange={(event) => setAccountLabel(event.target.value)}
                      placeholder="Personal or work account"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={"provider-url-" + provider.id} className="text-xs">
                      API base URL (custom endpoint supported)
                    </Label>
                    <Input
                      id={"provider-url-" + provider.id}
                      type="url"
                      className="h-8 font-mono text-xs"
                      value={providerUrl}
                      onChange={(event) => setProviderUrl(event.target.value)}
                      placeholder="https://your-custom-provider.com/v1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={"provider-key-" + provider.id} className="text-xs">
                      Provider API key or access token
                    </Label>
                    <Input
                      id={"provider-key-" + provider.id}
                      type="password"
                      className="h-8 font-mono text-xs"
                      disabled={providerTest.isPending}
                      autoComplete="off"
                      value={providerKey}
                      onChange={(event) => {
                        setProviderKey(event.target.value);
                        providerTest.reset();
                      }}
                      placeholder="Paste provider API key or token"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      disabled={
                        providerTest.isPending ||
                        configureMutation.isPending ||
                        providerKey.trim().length < 8
                      }
                      onClick={() =>
                        providerTest.mutate({
                          provider: provider.id,
                          api_key: providerKey,
                          endpoint_url: providerUrl || provider.baseUrl,
                        })
                      }
                    >
                      {providerTest.isPending ? "Testing…" : "Test API key"}
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      disabled={
                        providerTest.isPending ||
                        configureMutation.isPending ||
                        providerKey.trim().length < 8
                      }
                      onClick={() => configureMutation.mutate()}
                    >
                      {configureMutation.isPending ? (
                        <Loader2 className="mr-1 size-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="mr-1 size-3.5" />
                      )}
                      {connectionId ? "Verify and reconnect" : "Verify and connect"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs"
                      disabled={providerTest.isPending}
                      onClick={() => {
                        setActiveProvider(null);
                        setConnectionId(null);
                        setProviderKey("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {providerTest.data ? (
                    <p role="status" className="text-xs">
                      {providerTest.data.detail}
                    </p>
                  ) : null}
                  {providerTest.error ? (
                    <p role="alert" className="text-xs text-destructive">
                      {providerTest.error.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Provider keys are never returned to the browser after saving. Clients continue using only
        their scoped Open-Connect key and the shared `/v1` base URL.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Custom deployments: point any provider card at your own OpenAI-compatible endpoint
        (Together, DeepInfra, vLLM, LiteLLM, and others) by editing its base URL. Keys are validated
        against that endpoint and gateway requests are routed to it with the saved credential.
        Custom endpoints must be public HTTPS URLs.
      </p>
    </div>
  );
}
