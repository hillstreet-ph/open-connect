/**
 * Client-safe model alias reference for the Open-Connect gateway.
 * Single source of truth: the gateway server re-exports these constants so
 * the UI, the discovery endpoints, and the routing layer never drift apart.
 */

/** Canonical alias map used by the gateway when resolving a requested model id. */
export const MODEL_ALIASES: Record<string, string> = {
  // Free tier (OpenRouter)
  auto: "openrouter/free",
  "open-connect/auto": "openrouter/free",
  "open-connect/free": "openrouter/free",
  "open-connect/auto-free": "openrouter/free",
  free: "openrouter/free",
  "openrouter/free": "openrouter/free",

  // --- Open-Auto (pyramid default: needs-based selection across providers) ---
  "open-connect/open-auto": "openrouter/auto",
  "open-auto": "openrouter/auto",

  // --- Open-Connect virtual (stable for agents) ---
  "open-connect/high": "openai/gpt-4o",
  "open-connect/deep": "openai/o3-mini",
  "open-connect/wide": "openrouter/auto",
  "open-connect/fast": "openai/gpt-4o-mini",
  "open-connect/cheap": "openai/gpt-4o-mini",
  "open-connect/balanced": "openai/gpt-4o-mini",
  "open-connect/reasoning": "openai/gpt-4o",
  "open-connect/coding": "openai/gpt-4o",
  "open-connect/vision": "openai/gpt-4o",
  "open-connect/claude": "anthropic/claude-sonnet-4",
  "open-connect/claude-fast": "anthropic/claude-3-haiku",
  "open-connect/gemini": "google/gemini-2.5-flash",
  "open-connect/gemini-pro": "google/gemini-2.5-pro",
  "open-connect/grok": "x-ai/grok-2-1212",
  "open-connect/llama": "meta-llama/llama-3.3-70b-instruct",
  "open-connect/deepseek": "deepseek/deepseek-chat",
  "open-connect/mistral": "mistralai/mistral-large",
  "open-connect/embedding": "openai/text-embedding-3-small",

  // --- Short logical names (LiteLLM-style) ---
  high: "openai/gpt-4o",
  deep: "openai/o3-mini",
  wide: "openrouter/auto",
  fast: "openai/gpt-4o-mini",
  cheap: "openai/gpt-4o-mini",
  balanced: "openai/gpt-4o-mini",
  reasoning: "openai/gpt-4o",
  coding: "openai/gpt-4o",
  vision: "openai/gpt-4o",
  embedding: "openai/text-embedding-3-small",

  // --- OpenAI ---
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4.1": "openai/gpt-4.1",
  "gpt-4.1-mini": "openai/gpt-4.1-mini",
  "gpt-4.1-nano": "openai/gpt-4.1-nano",
  o1: "openai/o1",
  "o1-mini": "openai/o1-mini",
  "o3-mini": "openai/o3-mini",
  "openai/gpt-4o": "openai/gpt-4o",
  "openai/gpt-4o-mini": "openai/gpt-4o-mini",
  "openai/gpt-4.1": "openai/gpt-4.1",
  "openai/o1": "openai/o1",
  "openai/text-embedding-3-small": "openai/text-embedding-3-small",
  "openai/text-embedding-3-large": "openai/text-embedding-3-large",

  // --- Anthropic / Claude ---
  "claude-sonnet": "anthropic/claude-sonnet-4",
  "claude-sonnet-4": "anthropic/claude-sonnet-4",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "claude-3-opus": "anthropic/claude-3-opus",
  "claude-3-haiku": "anthropic/claude-3-haiku",
  "claude-opus": "anthropic/claude-3-opus",
  "claude-haiku": "anthropic/claude-3-haiku",
  "anthropic/claude-sonnet-4": "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-opus": "anthropic/claude-3-opus",
  "anthropic/claude-3-haiku": "anthropic/claude-3-haiku",

  // --- Google / Gemini ---
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "gemini-flash": "google/gemini-2.5-flash",
  "gemini-pro": "google/gemini-2.5-pro",
  "google/gemini-2.5-flash": "google/gemini-2.5-flash",
  "google/gemini-2.5-pro": "google/gemini-2.5-pro",

  // --- Meta / DeepSeek / Mistral / xAI ---
  "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct",
  "deepseek-chat": "deepseek/deepseek-chat",
  "deepseek/deepseek-chat": "deepseek/deepseek-chat",
  "mistral-large": "mistralai/mistral-large",
  "mistralai/mistral-large": "mistralai/mistral-large",
  "grok-2": "x-ai/grok-2-1212",
  "x-ai/grok-2-1212": "x-ai/grok-2-1212",
};

/** Rotation aliases handled specially by the gateway resolver. */
export const SPECIAL_ALIASES: Record<string, string> = {
  "open-connect/rotate-free": "openrouter/free (rotates the free model pool)",
  "open-connect/free-rotate": "openrouter/free (rotates the free model pool)",
  "free-rotate": "openrouter/free (rotates the free model pool)",
};

/** OpenRouter :free models — rotate for the free-rotate aliases. */
export const FREE_MODEL_POOL: string[] = [
  "openrouter/free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "liquid/lfm-2.5-2.6b:free",
  "thinkingmachines/inkling:free",
  "thinkingmachines/inkling-small:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "cohere/north-mini-code:free",
  "nex-agi/nex-n2.5-mini:free",
  "nex-agi/nex-n2.5-pro:free",
  "inclusionai/ling-3.0-flash-sante:free",
  "inclusionai/ling-3.0-flash-fin:free",
];

export const MANAGED_MODEL_IDS: string[] = Array.from(
  new Set([...Object.keys(MODEL_ALIASES), ...Object.values(MODEL_ALIASES), ...FREE_MODEL_POOL]),
);

/** Resolve an alias to the routed model id (rotation aliases included). */
export function aliasTarget(alias: string): string {
  return MODEL_ALIASES[alias] ?? SPECIAL_ALIASES[alias] ?? alias;
}

/** Complete public alias list exposed at /.well-known/ai-gateway and /llms.txt. */
export const AI_GATEWAY_ALIASES: string[] = [
  "open-connect/auto",
  "open-connect/free",
  "open-connect/auto-free",
  "open-connect/rotate-free",
  "open-connect/open-auto",
  "open-connect/wide",
  "open-connect/high",
  "open-connect/deep",
  "open-connect/fast",
  "open-connect/cheap",
  "open-connect/balanced",
  "open-connect/coding",
  "open-connect/reasoning",
  "open-connect/vision",
  "open-connect/embedding",
  "open-connect/claude",
  "open-connect/claude-fast",
  "open-connect/gemini",
  "open-connect/gemini-pro",
  "open-connect/grok",
  "open-connect/llama",
  "open-connect/deepseek",
  "open-connect/mistral",
  "auto",
  "free",
  "open-auto",
  "wide",
  "high",
  "deep",
  "fast",
  "cheap",
  "balanced",
  "reasoning",
  "coding",
  "vision",
  "embedding",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o1",
  "o1-mini",
  "o3-mini",
  "claude-sonnet",
  "claude-sonnet-4",
  "claude-3.5-sonnet",
  "claude-3-opus",
  "claude-3-haiku",
  "claude-opus",
  "claude-haiku",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash",
  "gemini-pro",
  "llama-3.3-70b",
  "deepseek-chat",
  "mistral-large",
  "grok-2",
];

export type AliasGroup = {
  tier: string;
  items: Array<{ alias: string; body: string }>;
};

/** Organized tiers rendered on the AI Gateway page. Must cover every alias. */
export const ALIAS_GROUPS: AliasGroup[] = [
  {
    tier: "Auto · free first",
    items: [
      { alias: "open-connect/auto", body: "Default model · free first, rotates on limits" },
      { alias: "open-connect/free", body: "Free router · alias of auto" },
      { alias: "open-connect/auto-free", body: "Free router · alias of auto" },
      { alias: "open-connect/rotate-free", body: "Round-robin across the free model pool" },
    ],
  },
  {
    tier: "Open-Auto · needs-based selection",
    items: [
      {
        alias: "open-connect/open-auto",
        body: "Open-Auto wide · picks the right model automatically per task",
      },
      { alias: "open-connect/wide", body: "Multi-provider breadth via the auto router" },
    ],
  },
  {
    tier: "Quality and cost",
    items: [
      { alias: "open-connect/high", body: "Flagship quality" },
      { alias: "open-connect/deep", body: "Extended reasoning" },
      { alias: "open-connect/fast", body: "Low latency" },
      { alias: "open-connect/cheap", body: "Lowest cost" },
      { alias: "open-connect/balanced", body: "Balanced cost and quality" },
    ],
  },
  {
    tier: "Specialists",
    items: [
      { alias: "open-connect/coding", body: "Code specialist" },
      { alias: "open-connect/reasoning", body: "Reasoning specialist" },
      { alias: "open-connect/vision", body: "Multimodal vision" },
      { alias: "open-connect/embedding", body: "Text embeddings" },
    ],
  },
  {
    tier: "Provider routes",
    items: [
      { alias: "open-connect/claude", body: "Claude Sonnet via OpenRouter" },
      { alias: "open-connect/claude-fast", body: "Claude Haiku · fast" },
      { alias: "open-connect/gemini", body: "Gemini Flash" },
      { alias: "open-connect/gemini-pro", body: "Gemini Pro" },
      { alias: "open-connect/grok", body: "xAI Grok" },
      { alias: "open-connect/llama", body: "Meta Llama" },
      { alias: "open-connect/deepseek", body: "DeepSeek Chat" },
      { alias: "open-connect/mistral", body: "Mistral Large" },
    ],
  },
  {
    tier: "Short names · quality and specialists",
    items: [
      { alias: "auto", body: "Alias of open-connect/auto" },
      { alias: "free", body: "Alias of the free router" },
      { alias: "open-auto", body: "Alias of open-connect/open-auto" },
      { alias: "wide", body: "Multi-provider breadth" },
      { alias: "high", body: "Flagship quality" },
      { alias: "deep", body: "Extended reasoning" },
      { alias: "fast", body: "Low latency" },
      { alias: "cheap", body: "Lowest cost" },
      { alias: "balanced", body: "Balanced" },
      { alias: "reasoning", body: "Reasoning" },
      { alias: "coding", body: "Coding" },
      { alias: "vision", body: "Vision" },
      { alias: "embedding", body: "Embeddings" },
    ],
  },
  {
    tier: "Short names · OpenAI",
    items: [
      { alias: "gpt-4o", body: "GPT-4o" },
      { alias: "gpt-4o-mini", body: "GPT-4o mini" },
      { alias: "gpt-4.1", body: "GPT-4.1" },
      { alias: "gpt-4.1-mini", body: "GPT-4.1 mini" },
      { alias: "gpt-4.1-nano", body: "GPT-4.1 nano" },
      { alias: "o1", body: "o1" },
      { alias: "o1-mini", body: "o1-mini" },
      { alias: "o3-mini", body: "o3-mini" },
    ],
  },
  {
    tier: "Short names · Anthropic",
    items: [
      { alias: "claude-sonnet", body: "Claude Sonnet" },
      { alias: "claude-sonnet-4", body: "Claude Sonnet 4" },
      { alias: "claude-3.5-sonnet", body: "Claude 3.5 Sonnet" },
      { alias: "claude-3-opus", body: "Claude 3 Opus" },
      { alias: "claude-3-haiku", body: "Claude 3 Haiku" },
      { alias: "claude-opus", body: "Claude Opus" },
      { alias: "claude-haiku", body: "Claude Haiku" },
    ],
  },
  {
    tier: "Short names · Google",
    items: [
      { alias: "gemini-2.5-flash", body: "Gemini 2.5 Flash" },
      { alias: "gemini-2.5-pro", body: "Gemini 2.5 Pro" },
      { alias: "gemini-flash", body: "Gemini Flash" },
      { alias: "gemini-pro", body: "Gemini Pro" },
    ],
  },
  {
    tier: "Short names · Meta, DeepSeek, Mistral, xAI",
    items: [
      { alias: "llama-3.3-70b", body: "Llama 3.3 70B Instruct" },
      { alias: "deepseek-chat", body: "DeepSeek Chat" },
      { alias: "mistral-large", body: "Mistral Large" },
      { alias: "grok-2", body: "Grok 2" },
    ],
  },
];
