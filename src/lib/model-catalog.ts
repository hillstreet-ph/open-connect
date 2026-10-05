export type FreeModelSource = "openrouter" | "litellm" | "nvidia" | "ollama_cloud";

export type FreeModelEntry = {
  id: string;
  provider: string;
  source: FreeModelSource;
  name: string | null;
};

export type CatalogUpstream = {
  name: string;
  baseUrl: string;
  headers: Record<string, string>;
};

type OpenRouterModel = {
  id?: unknown;
  name?: unknown;
  pricing?: Record<string, unknown> | null;
};

// NVIDIA marks hosted prototypes as "Free Endpoint" in its official model catalog;
// the inference API does not expose that entitlement with the /models response.
const NVIDIA_FREE_ENDPOINT_MODELS = new Set([
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "openai/gpt-oss-20b",
  "meta/llama-3.2-11b-vision-instruct",
  "meta/llama-3.2-90b-vision-instruct",
  "google/gemma-4-31b-it",
]);
// Ollama documents gemma4:cloud as included in its free cloud plan.
const OLLAMA_CLOUD_FREE_MODELS = new Set(["gemma4:cloud"]);

function zero(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value === 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed === 0;
  }
  return false;
}

function providerFromModelId(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "unknown";
}

export function isOpenRouterFreeModel(model: OpenRouterModel): boolean {
  if (typeof model.id !== "string" || !model.id.trim()) return false;
  if (model.id.endsWith(":free")) return true;
  const pricing = model.pricing;
  if (!pricing || !zero(pricing["prompt"]) || !zero(pricing["completion"])) return false;
  return Object.values(pricing).every((value) => value == null || zero(value));
}

export function openRouterFreeModels(payload: unknown): FreeModelEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is OpenRouterModel => Boolean(item && typeof item === "object"))
    .filter(isOpenRouterFreeModel)
    .map((item) => {
      const id = item.id as string;
      return {
        id,
        provider: providerFromModelId(id),
        source: "openrouter" as const,
        name: typeof item.name === "string" ? item.name : null,
      };
    });
}

function liteLlmFreeItem(item: unknown): FreeModelEntry | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const modelInfo = row["model_info"];
  const info =
    modelInfo && typeof modelInfo === "object" ? (modelInfo as Record<string, unknown>) : {};
  const params = row["litellm_params"];
  const parameters =
    params && typeof params === "object" ? (params as Record<string, unknown>) : {};
  const id = [row["model_name"], info["model_name"], parameters["model"], row["id"]].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  if (!id) return null;
  const inputCost = info["input_cost_per_token"] ?? parameters["input_cost_per_token"];
  const outputCost = info["output_cost_per_token"] ?? parameters["output_cost_per_token"];
  const freeByMetadata = zero(inputCost) && zero(outputCost);
  if (!freeByMetadata && !id.endsWith(":free")) return null;
  return {
    id,
    provider: providerFromModelId(id),
    source: "litellm",
    name: typeof info["display_name"] === "string" ? info["display_name"] : null,
  };
}

export function liteLlmFreeModels(payload: unknown): FreeModelEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.map(liteLlmFreeItem).filter((item): item is FreeModelEntry => item !== null);
}

function modelInfoUrls(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const root = base.replace(/\/v1$/i, "");
  return [...new Set([`${root}/model/info`, `${root}/v1/model/info`, `${base}/model/info`])];
}

export async function fetchFreeModelCatalog(
  upstreams: CatalogUpstream[],
  send: typeof fetch = fetch,
): Promise<FreeModelEntry[]> {
  const results = await Promise.all(
    upstreams.map(async (upstream): Promise<FreeModelEntry[]> => {
      const paths =
        upstream.name === "openrouter"
          ? [`${upstream.baseUrl.replace(/\/+$/, "")}/models`]
          : upstream.name === "litellm"
            ? modelInfoUrls(upstream.baseUrl)
            : ["nvidia", "ollama_cloud"].includes(upstream.name)
              ? [`${upstream.baseUrl.replace(/\/+$/, "")}/models`]
              : [];
      for (const url of paths) {
        try {
          const response = await send(url, {
            method: "GET",
            headers: upstream.headers,
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) continue;
          const payload: unknown = await response.json();
          if (upstream.name === "openrouter") return openRouterFreeModels(payload);
          if (upstream.name === "litellm") return liteLlmFreeModels(payload);
          const allowed =
            upstream.name === "nvidia" ? NVIDIA_FREE_ENDPOINT_MODELS : OLLAMA_CLOUD_FREE_MODELS;
          const data =
            payload && typeof payload === "object" ? (payload as { data?: unknown }).data : null;
          if (!Array.isArray(data)) return [];
          return data
            .filter((item): item is { id: string; name?: string } =>
              Boolean(
                item &&
                typeof item === "object" &&
                typeof (item as { id?: unknown }).id === "string",
              ),
            )
            .filter((item) => allowed.has(item.id))
            .map((item) => ({
              id: item.id,
              provider:
                providerFromModelId(item.id) === "unknown"
                  ? upstream.name
                  : providerFromModelId(item.id),
              source: upstream.name as "nvidia" | "ollama_cloud",
              name: typeof item.name === "string" ? item.name : null,
            }));
        } catch {
          // Keep other configured providers available if a catalog is offline.
        }
      }
      return [];
    }),
  );
  const unique = new Map<string, FreeModelEntry>();
  for (const entry of results.flat()) {
    const key = `${entry.source}:${entry.id}`;
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()].sort(
    (left, right) => left.provider.localeCompare(right.provider) || left.id.localeCompare(right.id),
  );
}

export function isAutoFreeModel(model: string): boolean {
  return [
    "",
    "auto",
    "free",
    "open-connect/auto",
    "open-connect/free",
    "open-connect/auto-free",
  ].includes(model.trim().toLowerCase());
}
