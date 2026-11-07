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

export function createTinyFishClient(apiKey: string, send: typeof fetch = fetch) {
  if (!apiKey || apiKey.length < 8) throw new Error("TinyFish API key is not configured.");
  async function request<T>(
    path: string,
    init: RequestInit = {},
    base = TINYFISH_API,
    timeoutMs = 25_000,
  ): Promise<T> {
    const response = await send(`${base}${path}`, {
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
    if (response.status === 204) return undefined as T;
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    if (!response.ok || (payload.error && (payload as { run_id?: unknown }).run_id == null)) {
      throw new TinyFishError(
        response.status,
        payload.error?.code ?? `HTTP_${response.status}`,
        payload.error?.message ?? `TinyFish returned HTTP ${response.status}.`,
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
