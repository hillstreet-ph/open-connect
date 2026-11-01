export const AI_GATEWAY_PROVIDERS = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    official: false,
  },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", official: true },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    official: true,
  },
  { id: "ollama_cloud", name: "Ollama Cloud", baseUrl: "https://ollama.com/v1", official: false },
  {
    id: "kilo",
    name: "Kilo Code Gateway",
    baseUrl: "https://ai-gateway.kilo.ai/api/v1",
    official: false,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    baseUrl: "https://router.huggingface.co/v1",
    official: true,
  },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", official: true },
  {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    official: true,
  },
  {
    id: "novita",
    name: "Novita AI",
    baseUrl: "https://api.novita.ai/openai",
    official: true,
  },
  {
    id: "cohere",
    name: "Cohere",
    baseUrl: "https://api.cohere.com/compatibility/v1",
    official: true,
  },
  {
    id: "anthropic",
    name: "Anthropic / Claude",
    baseUrl: "https://api.anthropic.com/v1",
    official: true,
  },
  {
    id: "google",
    name: "Google / Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    official: true,
  },
  { id: "xai", name: "xAI / Grok", baseUrl: "https://api.x.ai/v1", official: true },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", official: true },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", official: true },
] as const;

export const AI_GATEWAY_PROVIDER_IDS: ReadonlySet<string> = new Set(
  AI_GATEWAY_PROVIDERS.map((provider) => provider.id),
);

export const COMPATIBLE_GATEWAY_PROVIDERS = AI_GATEWAY_PROVIDERS.filter(
  (provider) => provider.id !== "anthropic",
);
