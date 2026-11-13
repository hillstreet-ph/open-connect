/**
 * TinyFish Web Agent REST client (https://docs.tinyfish.ai). Pure and
 * fetch-injectable so it runs in tests and on the server. The API key is only
 * ever sent to TinyFish API hosts (*.tinyfish.ai) in the X-API-Key header.
 */
export const TINYFISH_API = "https://agent.tinyfish.ai";
export const TINYFISH_BROWSER_API = "https://api.browser.tinyfish.ai";
export const TINYFISH_SEARCH_API = "https://api.search.tinyfish.ai";
export const TINYFISH_FETCH_API = "https://api.fetch.tinyfish.ai";

export const TINYFISH_PROVIDERS = ["tinyfish", "custom_tinyfish_mcp"] as const;

export type TinyFishRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export const TERMINAL_RUN_STATUSES: readonly TinyFishRunStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export type TinyFishRun = {
  run_id: string;
  status: TinyFishRunStatus;
  goal: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  num_of_steps: number | null;
  result: unknown;
  error: { message?: string; category?: string; code?: string } | null;
  profile_attached?: boolean;
  profile_id?: string | null;
  streaming_url: string | null;
  video_url?: string | null;
  steps?: Array<{ id: string; action: string | null; status: string; timestamp: string }>;
};

export type TinyFishProfile = {
  id: string;
  name: string;
  is_default?: boolean;
  domain_count?: number;
  proxy_country_code?: string | null;
  created_at: string;
  updated_at?: string;
};

export type StartRunInput = {
  url: string;
  goal: string;
  use_profile?: boolean;
  profile_id?: string;
  browser_profile?: "lite" | "stealth";
  proxy_country_code?: string;
  max_duration_seconds?: number;
};

export class TinyFishError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TinyFishError";
    this.status = status;
    this.code = code;
  }
}

const RUN_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function assertRunId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!RUN_ID.test(id)) throw new Error("A valid TinyFish run_id is required.");
  return id;
}

export function assertSessionId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!SESSION_ID.test(id)) throw new Error("A valid browser session_id is required.");
  return id;
}

export function assertProfileId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!PROFILE_ID.test(id)) throw new Error("Invalid Browser Context Profile id.");
  return id;
}

export function normalizeProfileInput(input: { name?: string; set_as_default?: boolean }) {
  const name = input.name?.trim();
  if (!name || name.length > 100) throw new Error("Profile name must be 1–100 characters.");
  return { name, set_as_default: input.set_as_default === true };
}

/** Validate and normalize a run request before it leaves Open-Connect. */
export function normalizeStartRun(input: Record<string, unknown>): StartRunInput {
  const rawUrl = String(input["url"] ?? "").trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error("A valid starting URL is required.");
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Starting URL must be http(s) without embedded credentials.");
  const goal = String(input["goal"] ?? "").trim();
  if (!goal) throw new Error("Describe the goal for the cloud browser.");
  if (goal.length > 8000) throw new Error("Goal is too long (8000 characters max).");
  const out: StartRunInput = { url: url.toString(), goal };
  // Saved sign-ins are the point of the cloud browser: default to the profile.
  out.use_profile = input["use_profile"] !== false;
  const profileId = String(input["profile_id"] ?? "").trim();
  if (profileId) {
    if (!PROFILE_ID.test(profileId)) throw new Error("Invalid Browser Context Profile id.");
    out.profile_id = profileId;
    out.use_profile = true;
  }
  if (input["browser_profile"] === "stealth" || input["stealth"] === true)
    out.browser_profile = "stealth";
  const country = String(input["proxy_country_code"] ?? "")
    .trim()
    .toUpperCase();
  if (country) {
    if (!/^[A-Z]{2}$/.test(country)) throw new Error("Proxy country must be a 2-letter code.");
    out.proxy_country_code = country;
  }
  const max = Number(input["max_duration_seconds"] ?? 0);
  if (Number.isFinite(max) && max > 0) out.max_duration_seconds = Math.min(Math.trunc(max), 3600);
  return out;
}

export function startRunBody(input: StartRunInput) {
  return {
    url: input.url,
    goal: input.goal,
    api_integration: "open-connect",
    use_profile: input.use_profile !== false,
    ...(input.profile_id ? { profile_id: input.profile_id } : {}),
    ...(input.browser_profile ? { browser_profile: input.browser_profile } : {}),
    ...(input.proxy_country_code
      ? { proxy_config: { enabled: true, country_code: input.proxy_country_code } }
      : {}),
    ...(input.max_duration_seconds
      ? { agent_config: { max_duration_seconds: input.max_duration_seconds } }
      : {}),
  };
}

export function requiresBrowserSignIn(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const value = "result" in result ? (result as { result: unknown }).result : result;
  return (
    !!value &&
    typeof value === "object" &&
    "authenticated" in value &&
    value.authenticated === false
  );
}

/** Trim a run for agents and UI: no screenshots, bounded steps. */
export function summarizeRun(run: TinyFishRun) {
  return {
    run_id: run.run_id,
    status: run.status,
    goal: run.goal.length > 500 ? `${run.goal.slice(0, 500)}…` : run.goal,
    created_at: run.created_at,
    started_at: run.started_at,
    finished_at: run.finished_at,
    steps: run.num_of_steps,
    profile_id: run.profile_id ?? null,
    streaming_url: run.streaming_url ?? null,
    video_url: run.video_url ?? null,
    result: run.result ?? null,
    requires_sign_in: requiresBrowserSignIn(run.result),
    error: run.error ? { message: run.error.message, category: run.error.category } : null,
    terminal: TERMINAL_RUN_STATUSES.includes(run.status),
    recent_actions: (run.steps ?? [])
      .slice(-8)
      .map((step) => step.action)
      .filter((action): action is string => Boolean(action)),
  };
}

export type WebSearchInput = {
  query: string;
  location?: string;
  language?: string;
  domain_type?: "web" | "news" | "research_paper";
  include_domains?: string;
  exclude_domains?: string;
  recency_minutes?: number;
  page?: number;
};

export type WebSearchResult = {
  position: number;
  title: string;
  url: string;
  snippet: string;
  site_name?: string;
  date?: string;
};

const COUNTRY = /^[A-Z]{2}$/;
const LANGUAGE = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;
const DOMAIN_LIST = /^[a-z0-9.-]+(?:,[a-z0-9.-]+){0,19}$/;

/** Validate and normalise a TinyFish Search request; unknown fields are dropped. */
export function normalizeWebSearch(input: Record<string, unknown>): WebSearchInput {
  const query = String(input["query"] ?? "").trim();
  if (!query) throw new Error("Enter a search query.");
  if (query.length > 500) throw new Error("Search query must be 500 characters or fewer.");
  const out: WebSearchInput = { query };
  const location = String(input["location"] ?? "")
    .trim()
    .toUpperCase();
  if (location) {
    if (!COUNTRY.test(location)) throw new Error("Location must be a two-letter country code.");
    out.location = location;
  }
  const language = String(input["language"] ?? "").trim();
  if (language) {
    if (!LANGUAGE.test(language)) throw new Error("Language must be a code such as en or pt-BR.");
    out.language = language;
  }
  const domainType = input["domain_type"];
  if (domainType === "web" || domainType === "news" || domainType === "research_paper")
    out.domain_type = domainType;
  for (const field of ["include_domains", "exclude_domains"] as const) {
    const value = String(input[field] ?? "")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (!value) continue;
    if (!DOMAIN_LIST.test(value)) throw new Error(`${field} must be comma-separated domains.`);
    out[field] = value;
  }
  if (input["recency_minutes"] !== undefined && input["recency_minutes"] !== null) {
    const minutes = Math.trunc(Number(input["recency_minutes"]));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 5_256_000)
      throw new Error("recency_minutes must be between 1 and 5256000.");
    out.recency_minutes = minutes;
  }
  if (input["page"] !== undefined && input["page"] !== null) {
    const page = Math.trunc(Number(input["page"]));
    if (!Number.isFinite(page) || page < 0 || page > 10) throw new Error("page must be 0-10.");
    out.page = page;
  }
  return out;
}

export function webSearchQuery(input: WebSearchInput): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}

export type WebFetchInput = {
  urls: string[];
  format: "markdown" | "html";
  links?: boolean;
  ttl?: number;
};

/** Public http(s) URLs only; TinyFish also rejects private/metadata targets server-side. */
export function normalizeWebFetch(input: Record<string, unknown>): WebFetchInput {
  const raw = Array.isArray(input["urls"])
    ? input["urls"]
    : input["url"] !== undefined
      ? [input["url"]]
      : [];
  if (raw.length === 0) throw new Error("Provide at least one URL.");
  if (raw.length > 10) throw new Error("Fetch at most 10 URLs at a time.");
  const urls = raw.map((value) => {
    let url: URL;
    try {
      url = new URL(String(value ?? "").trim());
    } catch {
      throw new Error("Each URL must be a valid http(s) URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("Each URL must use http or https.");
    if (url.username || url.password) throw new Error("URLs must not contain credentials.");
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      /^(?:127|10|0)\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      host.startsWith("[")
    )
      throw new Error("Private and local addresses cannot be fetched.");
    return url.toString();
  });
  const out: WebFetchInput = { urls, format: input["format"] === "html" ? "html" : "markdown" };
  if (input["links"] === true) out.links = true;
  if (input["fresh"] === true) out.ttl = 0;
  return out;
}

export type WebFetchResult = {
  url: string;
  final_url?: string;
  title?: string | null;
  description?: string | null;
  text?: string | null;
  links?: string[];
};

/** Bound fetched page text so MCP results stay within client limits. */
export function summarizeFetch(
  payload: {
    results?: WebFetchResult[];
    errors?: Array<{ url?: string; error?: string; message?: string }>;
  },
  maxChars = 20_000,
) {
  return {
    results: (payload.results ?? []).map((result) => {
      const text = typeof result.text === "string" ? result.text : "";
      return {
        url: result.url,
        final_url: result.final_url ?? result.url,
        title: result.title ?? null,
        description: result.description ?? null,
        text: text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[truncated]` : text,
        truncated: text.length > maxChars,
        ...(result.links ? { links: result.links.slice(0, 200) } : {}),
      };
    }),
    errors: (payload.errors ?? []).map((error) => ({
      url: error.url ?? null,
      error: error.error ?? error.message ?? "fetch_failed",
    })),
  };
}

// ---------- Research, Monitor and Datasets (agent.tinyfish.ai) ----------

export type ResearchStatus =
  "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
export const TERMINAL_RESEARCH_STATUSES: readonly ResearchStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
];
export type ResearchRun = {
  research_run_id: string;
  status: ResearchStatus;
  query: string;
  deep_result?: { result?: string; citations?: string[]; termination_reason?: string } | null;
  quick_result_summary?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

const RESEARCH_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUIDISH = /^[A-Za-z0-9-]{1,64}$/;

export function assertResearchId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!RESEARCH_ID.test(id)) throw new Error("Invalid research run id.");
  return id;
}
export function assertResourceId(value: unknown, label = "id"): string {
  const id = String(value ?? "").trim();
  if (!UUIDISH.test(id)) throw new Error(`Invalid ${label}.`);
  return id;
}

export function normalizeResearch(input: Record<string, unknown>) {
  const query = String(input["query"] ?? "").trim();
  if (!query) throw new Error("Enter a research question.");
  if (query.length > 10_000)
    throw new Error("Research questions are limited to 10,000 characters.");
  const mode = input["mode"] === "max" ? "max" : "deep";
  const language = String(input["output_language"] ?? "").trim();
  if (language && !LANGUAGE.test(language))
    throw new Error("output_language must be a code such as en.");
  return { query, mode, ...(language ? { output_language: language } : {}) } as {
    query: string;
    mode: "deep" | "max";
    output_language?: string;
  };
}

export function summarizeResearch(run: ResearchRun) {
  return {
    research_run_id: run.research_run_id,
    status: run.status,
    terminal: TERMINAL_RESEARCH_STATUSES.includes(run.status),
    query: run.query,
    report: run.deep_result?.result ?? run.quick_result_summary ?? null,
    citations: run.deep_result?.citations ?? [],
    termination_reason: run.deep_result?.termination_reason ?? null,
    created_at: run.created_at ?? null,
    completed_at: run.completed_at ?? null,
  };
}

export type Monitor = {
  id: string;
  name: string | null;
  type: "fetch" | "search";
  config: Record<string, unknown>;
  schedule_cron: string;
  status: "active" | "paused" | string;
  last_error?: string | null;
  webhook_url?: string | null;
  created_at?: string;
};

const CRON = /^(?:CRON_TZ=[A-Za-z_]+(?:\/[A-Za-z_+-]+)*\s+)?(?:\S+\s+){4}\S+$/;

function publicHttpUrl(value: unknown, label: string): string {
  const [url] = normalizeWebFetch({ urls: [value] }).urls;
  if (!url) throw new Error(`${label} is required.`);
  return url;
}

/** Page monitors watch one URL; topic monitors re-run a search. */
export function normalizeMonitor(input: Record<string, unknown>) {
  const type = input["type"] === "search" ? "search" : input["type"] === "fetch" ? "fetch" : null;
  if (!type) throw new Error("Choose a page (fetch) or topic (search) monitor.");
  const schedule = String(input["schedule_cron"] ?? "").trim();
  if (!CRON.test(schedule)) throw new Error("schedule_cron must be a five-field cron expression.");
  const config =
    type === "fetch"
      ? { url: publicHttpUrl(input["url"], "Page URL"), format: "markdown" }
      : (() => {
          const query = String(input["query"] ?? "").trim();
          if (!query || query.length > 500) throw new Error("Enter a topic query (max 500 chars).");
          return { query, recency_minutes: 1440, result_limit: 5 };
        })();
  const name = String(input["name"] ?? "")
    .trim()
    .slice(0, 100);
  const purpose = String(input["purpose"] ?? "")
    .trim()
    .slice(0, 2000);
  const webhook = String(input["webhook_url"] ?? "").trim();
  return {
    type,
    config,
    schedule_cron: schedule,
    ...(name ? { name } : {}),
    ...(purpose ? { purpose } : {}),
    ...(webhook ? { webhook_url: publicHttpUrl(webhook, "Webhook URL") } : {}),
  };
}

export type Dataset = {
  id: string;
  name: string;
  status: string;
  target_rows: number;
  row_count: number;
  run?: {
    id: string;
    status: string;
    started_at?: string;
    finished_at?: string;
    error?: unknown;
  } | null;
  created_at?: string;
  spec?: { columns?: Array<{ name: string; label?: string; type: string }> };
};

export function normalizeDataset(input: Record<string, unknown>) {
  const prompt = String(input["prompt"] ?? "").trim();
  if (prompt.length < 3 || prompt.length > 15_000)
    throw new Error("Describe the dataset in 3 to 15,000 characters.");
  const rows = Math.trunc(Number(input["target_rows"] ?? 25));
  if (!Number.isFinite(rows) || rows < 1 || rows > 250)
    throw new Error("target_rows must be 1-250.");
  return { prompt, target_rows: rows };
}

export function summarizeDataset(dataset: Dataset) {
  return {
    id: dataset.id,
    name: dataset.name,
    status: dataset.status,
    row_count: dataset.row_count,
    target_rows: dataset.target_rows,
    run_status: dataset.run?.status ?? null,
    created_at: dataset.created_at ?? null,
    columns: (dataset.spec?.columns ?? []).map((column) => ({
      name: column.name,
      label: column.label ?? column.name,
      type: column.type,
    })),
  };
}

/** Actionable wording for common TinyFish failures; the provider message wins otherwise. */
export function tinyFishErrorMessage(status: number, providerMessage?: string): string {
  const code = ` (HTTP ${status})`;
  if (status === 401)
    return `TinyFish rejected the API key${code}. Update it in Connections → TinyFish Cloud Browser.`;
  if (status === 402)
    return `Your TinyFish wallet balance is empty${code}. Add funds at agent.tinyfish.ai/wallet.`;
  if (status === 429) return `TinyFish rate limit reached${code}. Wait a moment and try again.`;
  if (status === 403)
    return providerMessage
      ? `TinyFish denied this request${code}: ${providerMessage}`
      : `TinyFish denied this request${code}. This feature may not be enabled for your account.`;
  if (status >= 500) return `TinyFish is temporarily unavailable${code}. Try again shortly.`;
  return providerMessage ?? `TinyFish returned HTTP ${status}.`;
}

export function createTinyFishClient(apiKey: string, send: typeof fetch = fetch) {
  if (!apiKey || apiKey.length < 8) throw new Error("TinyFish API key is not configured.");
  async function request<T>(
    path: string,
    init: RequestInit = {},
    base = TINYFISH_API,
    timeoutMs = 25_000,
  ): Promise<T> {
    let response: Response;
    try {
      response = await send(`${base}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          ...(init.headers ?? {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Only transport failures are rewritten; deliberate errors (e.g. broker policy) pass through.
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      if (!timedOut && !(error instanceof TypeError)) throw error;
      throw new TinyFishError(
        0,
        timedOut ? "TIMEOUT" : "NETWORK",
        timedOut
          ? "TinyFish did not respond in time. Try again."
          : "TinyFish could not be reached. Check the connection and try again.",
      );
    }
    if (response.status === 204) return undefined as T;
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    if (!response.ok || (payload.error && (payload as { run_id?: unknown }).run_id == null)) {
      throw new TinyFishError(
        response.status,
        payload.error?.code ?? `HTTP_${response.status}`,
        tinyFishErrorMessage(response.status, payload.error?.message),
      );
    }
    return payload as T;
  }
  return {
    startRun: (input: StartRunInput) =>
      request<{ run_id: string | null; error: unknown }>("/v1/automation/run-async", {
        method: "POST",
        body: JSON.stringify(startRunBody(input)),
      }),
    getRun: (runId: string) =>
      request<TinyFishRun>(
        `/v1/runs/${encodeURIComponent(assertRunId(runId))}?screenshots=none&html=none`,
      ),
    listRuns: (input: { limit?: number; status?: TinyFishRunStatus; cursor?: string } = {}) => {
      const query = new URLSearchParams({
        limit: String(Math.min(Math.max(Math.trunc(input.limit ?? 20), 1), 100)),
        sort_direction: "desc",
      });
      if (input.status) query.set("status", input.status);
      if (input.cursor) query.set("cursor", input.cursor);
      return request<{
        data: TinyFishRun[];
        pagination?: { next_cursor?: string | null; has_more?: boolean };
      }>(`/v1/runs?${query}`);
    },
    cancelRun: (runId: string) =>
      request<unknown>(`/v1/runs/${encodeURIComponent(assertRunId(runId))}/cancel`, {
        method: "POST",
      }),
    listProfiles: () => request<{ profiles: TinyFishProfile[] }>("/v1/profiles"),
    createProfile: (input: { name: string; set_as_default?: boolean }) =>
      request<TinyFishProfile>("/v1/profiles", {
        method: "POST",
        body: JSON.stringify(normalizeProfileInput(input)),
      }),
    updateProfile: (profileId: string, input: { name: string; set_as_default?: boolean }) =>
      request<TinyFishProfile>(`/v1/profiles/${encodeURIComponent(assertProfileId(profileId))}`, {
        method: "PATCH",
        body: JSON.stringify(normalizeProfileInput(input)),
      }),
    startProfileSetup: (profileId: string, url: string) => {
      const normalized = normalizeStartRun({ url, goal: "Profile sign-in setup" });
      return request<{ session_id: string; cdp_url: string; base_url: string; expires_at: string }>(
        `/v1/profiles/${encodeURIComponent(assertProfileId(profileId))}/setup-session`,
        { method: "POST", body: JSON.stringify({ url: normalized.url, timeout_seconds: 900 }) },
        TINYFISH_API,
        60_000,
      );
    },
    finishProfileSetup: (profileId: string, sessionId: string, action: "save" | "cancel") => {
      if (action !== "save" && action !== "cancel") throw new Error("Choose save or cancel.");
      return request<Record<string, unknown>>(
        `/v1/profiles/${encodeURIComponent(assertProfileId(profileId))}/${action === "save" ? "save" : "setup-session/cancel"}`,
        { method: "POST", body: JSON.stringify({ session_id: assertSessionId(sessionId) }) },
      );
    },
    getProfile: (profileId: string) => {
      const id = String(profileId ?? "").trim();
      if (!PROFILE_ID.test(id)) throw new Error("Invalid Browser Context Profile id.");
      return request<
        TinyFishProfile & {
          domains?: Array<{ domain: string; cookie_count?: number; last_written_at?: string }>;
        }
      >(`/v1/profiles/${encodeURIComponent(id)}`);
    },
    getWallet: () => request<Record<string, unknown>>("/v1/wallet"),
    search: (input: WebSearchInput) =>
      request<{ query: string; results: WebSearchResult[]; total_results?: number; page?: number }>(
        `/?${webSearchQuery(input)}`,
        {},
        TINYFISH_SEARCH_API,
        30_000,
      ),
    startResearch: (input: ReturnType<typeof normalizeResearch>) =>
      request<{ research_run_id: string | null; error: unknown }>(
        "/v1/automation/run-research-async",
        { method: "POST", body: JSON.stringify(input) },
        TINYFISH_API,
        60_000,
      ),
    listResearch: (limit = 20) =>
      request<{ data: ResearchRun[] }>(
        `/v1/research-run?limit=${Math.min(Math.max(Math.trunc(limit), 1), 100)}`,
      ),
    getResearch: (id: string) =>
      request<ResearchRun>(`/v1/research-run/${encodeURIComponent(assertResearchId(id))}`),
    cancelResearch: (id: string) =>
      request<unknown>(`/v1/research-run/${encodeURIComponent(assertResearchId(id))}/cancel`, {
        method: "POST",
      }),
    listMonitors: () => request<{ monitors: Monitor[] }>("/v1/monitors"),
    createMonitor: (input: ReturnType<typeof normalizeMonitor>) =>
      request<{ monitor: Monitor; run?: unknown }>(
        "/v1/monitors",
        { method: "POST", body: JSON.stringify(input) },
        TINYFISH_API,
        120_000,
      ),
    setMonitorStatus: (id: string, status: "active" | "paused") =>
      request<Monitor>(`/v1/monitors/${encodeURIComponent(assertResourceId(id, "monitor id"))}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    runMonitor: (id: string) =>
      request<unknown>(
        `/v1/monitors/${encodeURIComponent(assertResourceId(id, "monitor id"))}/runs`,
        { method: "POST" },
        TINYFISH_API,
        120_000,
      ),
    deleteMonitor: (id: string) =>
      request<unknown>(`/v1/monitors/${encodeURIComponent(assertResourceId(id, "monitor id"))}`, {
        method: "DELETE",
      }),
    listDatasets: (limit = 20) =>
      request<{ data: Dataset[] }>(
        `/v1/datasets?limit=${Math.min(Math.max(Math.trunc(limit), 1), 100)}`,
      ),
    createDataset: (input: ReturnType<typeof normalizeDataset>) =>
      request<Dataset>(
        "/v1/datasets",
        { method: "POST", body: JSON.stringify(input) },
        TINYFISH_API,
        90_000,
      ),
    getDataset: (id: string) =>
      request<Dataset>(`/v1/datasets/${encodeURIComponent(assertResourceId(id, "dataset id"))}`),
    datasetRows: (id: string, limit = 100) =>
      request<{
        columns: Array<{ name: string; label?: string; type: string }>;
        rows: Array<{ _id: string; data: Record<string, unknown> }>;
        truncated?: boolean;
      }>(
        `/v1/datasets/${encodeURIComponent(assertResourceId(id, "dataset id"))}/rows?limit=${Math.min(Math.max(Math.trunc(limit), 1), 500)}`,
      ),
    populateDataset: (id: string) =>
      request<Dataset>(
        `/v1/datasets/${encodeURIComponent(assertResourceId(id, "dataset id"))}/populate`,
        { method: "POST", body: "{}" },
      ),
    deleteDataset: (id: string) =>
      request<unknown>(`/v1/datasets/${encodeURIComponent(assertResourceId(id, "dataset id"))}`, {
        method: "DELETE",
      }),
    fetchUrls: (input: WebFetchInput) =>
      request<{
        results?: WebFetchResult[];
        errors?: Array<{ url?: string; error?: string; message?: string }>;
      }>("", { method: "POST", body: JSON.stringify(input) }, TINYFISH_FETCH_API, 120_000),
    createBrowserSession: (input: { url?: string; timeout_seconds?: number }) =>
      request<{ session_id: string; cdp_url?: string; base_url?: string }>(
        "/",
        {
          method: "POST",
          body: JSON.stringify({
            ...(input.url ? { url: input.url } : {}),
            timeout_seconds: Math.min(Math.max(Math.trunc(input.timeout_seconds ?? 600), 5), 86400),
          }),
        },
        TINYFISH_BROWSER_API,
        60_000,
      ),
    closeBrowserSession: (sessionId: string) =>
      request<unknown>(
        `/${encodeURIComponent(assertSessionId(sessionId))}`,
        { method: "DELETE" },
        TINYFISH_BROWSER_API,
      ),
  };
}

export type TinyFishClient = ReturnType<typeof createTinyFishClient>;

/**
 * Start a run and briefly wait for its live streaming URL so callers can show
 * the browser immediately. Never waits for completion.
 */
export async function startRunWithLiveView(
  client: TinyFishClient,
  input: StartRunInput,
  options: { waitMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const started = await client.startRun(input);
  if (!started.run_id) throw new Error("TinyFish did not return a run id.");
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (options.waitMs ?? 9000);
  let run: TinyFishRun | null;
  do {
    await sleep(options.intervalMs ?? 1500);
    try {
      run = await client.getRun(started.run_id);
    } catch {
      run = null;
    }
  } while (
    (!run || (!run.streaming_url && !TERMINAL_RUN_STATUSES.includes(run.status))) &&
    Date.now() < deadline
  );
  return run
    ? summarizeRun(run)
    : {
        run_id: started.run_id,
        status: "PENDING" as const,
        streaming_url: null,
        terminal: false,
      };
}
