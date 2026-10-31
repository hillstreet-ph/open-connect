/**
 * Advanced Model Routing System
 *
 * Features:
 * - Automatic free model usage first, then paid when limits reached
 * - Automatic rotation when model limits are hit
 * - Multiple models for parallel execution (parallel processing)
 * - All models have access to tools, skills, and functions
 * - Custom AI provider base URL support
 * - Real-time model catalog fetching
 */

import { AI_GATEWAY_PROVIDERS } from "./ai-gateway-providers";
import { fetchFreeModelCatalog } from "./model-catalog";
import { resolveUpstreams, type Upstream } from "./gateway.server";

export type AiGatewayProvider = {
  id: string;
  name: string;
  baseUrl: string;
  custom: boolean;
};

export type ModelCapability = {
  id: string;
  provider: string;
  free: boolean;
  capabilities: string[];
  tools: string[];
  skills: string[];
  maxTokens: number;
  pricing: {
    prompt: number;
    completion: number;
  };
};

export type ModelUsageStats = {
  modelId: string;
  requests: number;
  tokens: number;
  errors: number;
  lastUsed: Date;
  rateLimited: boolean;
};

// In-memory cache for model capabilities and usage stats
const modelCapabilityCache = new Map<string, ModelCapability>();
const modelUsageStats = new Map<string, ModelUsageStats>();
const providerHealth = new Map<string, { healthy: boolean; lastCheck: Date; latency: number }>();

// Professional model capabilities mapping
export const PROFESSIONAL_CAPABILITIES: Record<string, string[]> = {
  "openai/gpt-4o": ["code", "reasoning", "vision", "tools", "skills"],
  "openai/gpt-4o-mini": ["code", "reasoning", "tools", "skills"],
  "anthropic/claude-sonnet-4": ["code", "reasoning", "tools", "skills"],
  "anthropic/claude-3-opus": ["code", "reasoning", "vision", "tools", "skills"],
  "google/gemini-2.5-flash": ["code", "reasoning", "vision", "tools", "skills"],
  "google/gemini-2.5-pro": ["code", "reasoning", "vision", "tools", "skills"],
  "meta-llama/llama-3.3-70b-instruct": ["code", "reasoning", "tools", "skills"],
  "mistralai/mistral-large": ["code", "reasoning", "tools", "skills"],
  "deepseek/deepseek-chat": ["code", "reasoning", "tools", "skills"],
  "x-ai/grok-2-1212": ["code", "reasoning", "tools", "skills"],
};

// Professional tools available to all models
export const PROFESSIONAL_TOOLS: string[] = [
  "code_execution",
  "file_operations",
  "web_search",
  "database_query",
  "api_integration",
  "calculator",
  "date_time",
  "resource_access",
  "skill_invocation",
];

// Professional skills available to all models
export const PROFESSIONAL_SKILLS: string[] = [
  "code_analysis",
  "code_generation",
  "code_review",
  "documentation",
  "testing",
  "debugging",
  "optimization",
  "architecture_design",
  "data_analysis",
  "problem_solving",
  "explanation",
  "summarization",
  "translation",
  "creative_writing",
];

/**
 * Extract provider from model ID
 */
function extractProvider(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash > 0 ? modelId.slice(0, slash) : "unknown";
}

/**
 * Check if a model is free
 */
async function isFreeModel(modelId: string, upstream: Upstream): Promise<boolean> {
  // Check if model ends with :free
  if (modelId.endsWith(":free")) return true;

  // Check free model catalog
  const freeModels = await fetchFreeModelCatalog([upstream]);
  return freeModels.some((m) => m.id === modelId);
}

/**
 * Get max tokens for a model
 */
function getMaxTokens(modelId: string): number {
  const maxTokensMap: Record<string, number> = {
    "openai/gpt-4o": 128000,
    "openai/gpt-4o-mini": 128000,
    "anthropic/claude-3-opus": 200000,
    "anthropic/claude-3-sonnet": 200000,
    "anthropic/claude-3-haiku": 200000,
    "google/gemini-2.5-flash": 1000000,
    "google/gemini-2.5-pro": 1000000,
  };
  return maxTokensMap[modelId] ?? 32000;
}

/**
 * Get pricing for a model
 */
function getPricing(modelId: string, free: boolean): { prompt: number; completion: number } {
  if (free) return { prompt: 0, completion: 0 };

  const pricingMap: Record<string, { prompt: number; completion: number }> = {
    "openai/gpt-4o": { prompt: 0.000005, completion: 0.000015 },
    "openai/gpt-4o-mini": { prompt: 0.0000015, completion: 0.000006 },
    "anthropic/claude-3-opus": { prompt: 0.000015, completion: 0.000075 },
    "anthropic/claude-3-sonnet": { prompt: 0.000003, completion: 0.000015 },
    "google/gemini-2.5-flash": { prompt: 0.000001, completion: 0.000003 },
  };
  return pricingMap[modelId] ?? { prompt: 0.000002, completion: 0.000008 };
}

/**
 * Get all models from connected providers (free and paid)
 */
export async function fetchAllModels(
  upstreams: Upstream[] = resolveUpstreams(),
): Promise<ModelCapability[]> {
  const models: ModelCapability[] = [];

  for (const upstream of upstreams) {
    try {
      const response = await fetch(`${upstream.baseUrl}/models`, {
        headers: upstream.headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          data?: { id?: string; created?: number; description?: string }[];
        } | null;

        const data = payload?.data;
        if (Array.isArray(data)) {
          for (const model of data) {
            if (model && typeof model.id === "string" && model.id.length > 0) {
              const provider = extractProvider(model.id);
              const free = await isFreeModel(model.id, upstream);
              const capabilities = PROFESSIONAL_CAPABILITIES[model.id] ?? [
                "code",
                "reasoning",
                "tools",
                "skills",
              ];

              models.push({
                id: model.id,
                provider,
                free,
                capabilities,
                tools: PROFESSIONAL_TOOLS,
                skills: PROFESSIONAL_SKILLS,
                maxTokens: getMaxTokens(model.id),
                pricing: getPricing(model.id, free),
              });
            }
          }
        }
      }
    } catch {
      // Continue with other upstreams
    }
  }

  return models;
}

/**
 * Sort models: free first, then by capability, then by provider
 */
export function sortModels(models: ModelCapability[]): ModelCapability[] {
  return models.sort((a, b) => {
    // Free models first
    if (a.free !== b.free) return a.free ? -1 : 1;

    // Then by capability count (more capabilities first)
    if (a.capabilities.length !== b.capabilities.length) {
      return b.capabilities.length - a.capabilities.length;
    }

    // Then by provider name
    return a.provider.localeCompare(b.provider);
  });
}

/**
 * Extract required capabilities from task
 */
function extractRequiredCapabilities(task: string): string[] {
  const capabilities: string[] = [];
  const lowerTask = task.toLowerCase();

  if (lowerTask.includes("code") || lowerTask.includes("program") || lowerTask.includes("script")) {
    capabilities.push("code");
  }
  if (
    lowerTask.includes("vision") ||
    lowerTask.includes("image") ||
    lowerTask.includes("picture")
  ) {
    capabilities.push("vision");
  }
  if (
    lowerTask.includes("reason") ||
    lowerTask.includes("think") ||
    lowerTask.includes("analyze")
  ) {
    capabilities.push("reasoning");
  }

  return [...new Set(capabilities)];
}

/**
 * Get the best model for a task
 */
export function getBestModel(
  models: ModelCapability[],
  task: string,
  preferFree: boolean = true,
): ModelCapability | null {
  const sorted = sortModels([...models]);

  // Filter by required capabilities
  const requiredCapabilities = extractRequiredCapabilities(task);
  const candidates = sorted.filter((m) =>
    requiredCapabilities.every((cap) => m.capabilities.includes(cap)),
  );

  if (candidates.length === 0) return null;

  // If we prefer free, return the first free model
  if (preferFree) {
    const freeCandidates = candidates.filter((m) => m.free);
    if (freeCandidates.length > 0) return freeCandidates[0] ?? null;
  }

  // Otherwise return the best candidate
  return candidates[0] ?? null;
}

/**
 * Rotate to next model when limit is hit
 */
export function rotateModel(
  currentModelId: string,
  models: ModelCapability[],
): ModelCapability | null {
  const sorted = sortModels([...models]);
  const currentIndex = sorted.findIndex((m) => m.id === currentModelId);

  if (currentIndex === -1) return null;

  // Try to find next free model
  for (let i = currentIndex + 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    if (candidate?.free) return candidate;
  }

  // If no free models available, return next paid model
  if (currentIndex + 1 < sorted.length) return sorted[currentIndex + 1] ?? null;

  // Wrap around to first model
  return sorted[0] ?? null;
}

/**
 * Get multiple models for parallel execution
 */
export function getParallelModels(
  models: ModelCapability[],
  count: number = 3,
  preferFree: boolean = true,
): ModelCapability[] {
  const sorted = sortModels([...models]);
  const selected: ModelCapability[] = [];

  // First, select free models
  if (preferFree) {
    const freeModels = sorted.filter((m) => m.free);
    selected.push(...freeModels.slice(0, count));
  }

  // If we need more, add paid models
  while (selected.length < count && selected.length < sorted.length) {
    for (const model of sorted) {
      if (!selected.includes(model) && (!preferFree || !model.free)) {
        selected.push(model);
        if (selected.length >= count) break;
      }
    }
  }

  return selected.slice(0, count);
}

/**
 * Record model usage
 */
export function recordModelUsage(modelId: string, tokens: number, success: boolean = true): void {
  const now = new Date();
  const stats: ModelUsageStats = modelUsageStats.get(modelId) ?? {
    modelId,
    requests: 0,
    tokens: 0,
    errors: 0,
    lastUsed: now,
    rateLimited: false,
  };

  stats.requests += 1;
  stats.tokens += tokens;
  stats.lastUsed = now;

  if (!success) {
    stats.errors += 1;
  }

  modelUsageStats.set(modelId, stats);
}

/**
 * Mark model as rate limited
 */
export function markRateLimited(modelId: string): void {
  const stats = modelUsageStats.get(modelId);
  if (stats) {
    stats.rateLimited = true;
    modelUsageStats.set(modelId, stats);
  }
}

/**
 * Check if model is rate limited
 */
export function isRateLimited(modelId: string): boolean {
  const stats = modelUsageStats.get(modelId);
  return stats?.rateLimited ?? false;
}

/**
 * Get healthy models (not rate limited)
 */
export function getHealthyModels(models: ModelCapability[]): ModelCapability[] {
  return models.filter((m) => !isRateLimited(m.id));
}

/**
 * Add custom AI provider
 */
export function addCustomProvider(id: string, name: string, baseUrl: string): AiGatewayProvider {
  const provider: AiGatewayProvider = {
    id,
    name,
    baseUrl,
    custom: true,
  };

  // Note: For persistence, this should be stored in database
  return provider;
}

/**
 * Get all providers including custom ones
 */
export function getAllProviders(): AiGatewayProvider[] {
  return AI_GATEWAY_PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    custom: false,
  }));
}

/**
 * Ensure all models have professional setup
 */
export function ensureProfessionalSetup(models: ModelCapability[]): ModelCapability[] {
  return models.map((model) => ({
    ...model,
    capabilities: [
      ...new Set([...model.capabilities, ...(PROFESSIONAL_CAPABILITIES[model.id] ?? [])]),
    ],
    tools: [...new Set([...model.tools, ...PROFESSIONAL_TOOLS])],
    skills: [...new Set([...model.skills, ...PROFESSIONAL_SKILLS])],
  }));
}

/**
 * Get models by provider
 */
export function getModelsByProvider(
  models: ModelCapability[],
  providerId: string,
): ModelCapability[] {
  return models.filter((m) => m.provider === providerId || m.id.startsWith(`${providerId}/`));
}

/**
 * Auto-select model based on task and availability
 */
export async function autoSelectModel(
  task: string,
  upstreams: Upstream[] = resolveUpstreams(),
): Promise<ModelCapability | null> {
  const models = await fetchAllModels(upstreams);
  const professionalModels = ensureProfessionalSetup(models);
  const healthyModels = getHealthyModels(professionalModels);

  return getBestModel(healthyModels, task, true);
}

/**
 * Auto-select multiple models for parallel execution
 */
export async function autoSelectParallelModels(
  task: string,
  count: number = 3,
  upstreams: Upstream[] = resolveUpstreams(),
): Promise<ModelCapability[]> {
  const models = await fetchAllModels(upstreams);
  const professionalModels = ensureProfessionalSetup(models);
  const healthyModels = getHealthyModels(professionalModels);

  return getParallelModels(healthyModels, count, true);
}

// Export types
export type { Upstream };
