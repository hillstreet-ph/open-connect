import { AI_GATEWAY_PROVIDERS } from "./ai-gateway-providers.ts";
import { AI_GATEWAY_ALIASES, aliasTarget } from "./model-aliases.ts";
import { GATEWAY_TOOLS, GATEWAY_TOOLS_USAGE } from "./gateway-tools.ts";

export { AI_GATEWAY_ALIASES };

/**
 * Public, credential-free metadata so any AI agent pointed at Open-Connect can
 * self-configure without scraping HTML. Served from /.well-known/ai-gateway.
 */
export function aiGatewayMetadata(issuer: string) {
  const base = issuer.replace(/\/+$/, "");
  return {
    name: "Open-Connect AI Gateway",
    description:
      "One OpenAI-compatible endpoint for the full OpenRouter catalog and every connected AI provider. Auto routing uses free models first and rotates automatically when limits are hit.",
    base_url: `${base}/v1`,
    default_model: "open-connect/auto",
    free_first_routing: true,
    auth: {
      type: "bearer",
      api_key_prefix: "sk-oc-",
      api_key_url: `${base}/models`,
      oauth_authorization_server: `${base}/.well-known/oauth-authorization-server`,
      mcp_protected_resource: `${base}/.well-known/oauth-protected-resource`,
    },
    endpoints: {
      models: `${base}/v1/models`,
      chat_completions: `${base}/v1/chat/completions`,
      mcp: `${base}/mcp`,
      health: `${base}/api/v1/health`,
      resources: `${base}/api/v1/resources`,
    },
    aliases: [...AI_GATEWAY_ALIASES],
    alias_targets: Object.fromEntries(
      AI_GATEWAY_ALIASES.map((alias) => [alias, aliasTarget(alias)]),
    ),
    server_tools: {
      note: "OpenRouter server tools (beta). Add one or more to the request tools array; the upstream executes them server-side for any routed model.",
      usage: GATEWAY_TOOLS_USAGE,
      tools: GATEWAY_TOOLS.map((tool) => ({
        id: tool.id,
        name: tool.name,
        group: tool.group,
        detail: tool.detail,
      })),
    },
    providers: AI_GATEWAY_PROVIDERS.map((provider) => ({
      id: provider.id,
      name: provider.name,
      base_url: provider.baseUrl,
      official: provider.official,
    })),
    client_quickstart: {
      base_url: `${base}/v1`,
      api_key: "sk-oc-...",
      model: "open-connect/auto",
    },
  };
}

/** Markdown discovery guide for LLM agents, served as /llms.txt. */
export function llmsTxt(issuer: string) {
  const base = issuer.replace(/\/+$/, "");
  const meta = aiGatewayMetadata(issuer);
  return [
    "# Open-Connect AI Gateway",
    "",
    `> OpenAI-compatible AI gateway at ${meta.base_url}. Create an API key (prefix ${meta.auth.api_key_prefix}) on the gateway page, then point any client or AI agent at the base URL.`,
    "",
    "## How to use",
    `- Chat: POST ${meta.endpoints.chat_completions} with "Authorization: Bearer sk-oc-..." and an OpenAI JSON body.`,
    `- Models: GET ${meta.endpoints.models} with the same bearer key. Returns the managed aliases plus every model from your connected providers.`,
    `- Default model: ${meta.default_model} (free models first, automatic rotation and fallback).`,
    `- MCP tools: ${meta.endpoints.mcp} with OAuth discovery at ${meta.auth.oauth_authorization_server}.`,
    `- Health: ${meta.endpoints.health}.`,
    "",
    "## Model aliases",
    ...meta.aliases.map((alias) => \`- \`\${alias}\` → \`\${aliasTarget(alias)}\`\`),
    "",
    "## Gateway tools",
    "OpenRouter server tools (beta) run on the upstream for any model routed through this gateway. Add them to the request tools array; the model decides when to call them and OpenRouter executes them server-side.",
    ...meta.server_tools.tools.map(
      (tool) => \`- \`\${tool.id}\` — \${tool.name} (\${tool.group}): \${tool.detail}\`,
    ),
    "",
    "Example request:",
    "",
    "\`\`\`",
    GATEWAY_TOOLS_USAGE,
    "\`\`\`",
    "",
    "## Providers",
    ...meta.providers.map((provider) => \`- \${provider.name} (\`\${provider.id}\`)\`),
    "",
    "## Links",
    \`- [AI Gateway](\${meta.auth.api_key_url})\`,
    \`- [Gateway discovery JSON](\${base}/.well-known/ai-gateway)\`,
    "",
  ].join("\n");
}
