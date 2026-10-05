export type FreeModelSource = "openrouter" | "litellm";

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
          return upstream.name === "openrouter"
            ? openRouterFreeModels(payload)
            : liteLlmFreeModels(payload);
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
