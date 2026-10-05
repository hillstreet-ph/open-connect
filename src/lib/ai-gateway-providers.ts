export const AI_GATEWAY_PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "ollama_cloud", name: "Ollama Cloud", baseUrl: "https://ollama.com/v1" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "cerebras", name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1" },
  { id: "anthropic", name: "Anthropic / Claude", baseUrl: "https://api.anthropic.com" },
  { id: "google", name: "Google / Gemini", baseUrl: "https://generativelanguage.googleapis.com" },
  { id: "xai", name: "xAI / Grok", baseUrl: "https://api.x.ai/v1" },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { id: "litellm", name: "LiteLLM proxy", baseUrl: "https://litellm.example.com/v1" },
] as const;

export const AI_GATEWAY_PROVIDER_IDS: ReadonlySet<string> = new Set(
  AI_GATEWAY_PROVIDERS.map((provider) => provider.id),
);
