export const AI_GATEWAY_PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "chatgpt", name: "ChatGPT", baseUrl: "https://api.openai.com/v1", oauth: true },
  { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "ollama_cloud", name: "Ollama Cloud", baseUrl: "https://ollama.com/v1" },
  { id: "kilo", name: "Kilo Code Gateway", baseUrl: "https://ai-gateway.kilo.ai/api/v1" },
  { id: "huggingface", name: "Hugging Face", baseUrl: "https://router.huggingface.co/v1" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "anthropic", name: "Anthropic / Claude", baseUrl: "https://api.anthropic.com/v1", oauth: true },
  {
    id: "google",
    name: "Google / Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  { id: "xai", name: "xAI / Grok", baseUrl: "https://api.x.ai/v1" },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
] as const;

export type AiGatewayProvider = typeof AI_GATEWAY_PROVIDERS[number];

export const AI_GATEWAY_PROVIDER_IDS: ReadonlySet<string> = new Set(
  AI_GATEWAY_PROVIDERS.map((provider) => provider.id),
);

export const COMPATIBLE_GATEWAY_PROVIDERS = AI_GATEWAY_PROVIDERS.filter(
  (provider) => provider.id !== "anthropic",
);
