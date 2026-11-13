const E2B_API = "https://api.e2b.dev";

function apiKey() {
  return process.env["E2B_API_KEY"]?.trim() ?? "";
}

export function e2bConfig() {
  return { configured: Boolean(apiKey()), endpoint: E2B_API };
}

async function request(path: string, init: RequestInit = {}) {
  const key = apiKey();
  if (!key) throw new Error("E2B is not configured");
  const response = await fetch(`${E2B_API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload["message"] === "string"
        ? payload["message"]
        : `E2B returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function e2bHealth() {
  return request("/health");
}

export async function listE2bSandboxes(limit = 100) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), 100);
  return request(`/sandboxes?limit=${safeLimit}`);
}

export async function createE2bSandbox(input: {
  template?: string;
  timeout?: number;
  metadata?: Record<string, string>;
}) {
  const timeout = Math.min(Math.max(Math.trunc(input.timeout ?? 300), 30), 3600);
  return request("/sandboxes", {
    method: "POST",
    body: JSON.stringify({
      templateID: input.template?.trim() || "base",
      timeout,
      metadata: {
        source: "open-connect",
        ...(input.metadata ?? {}),
      },
    }),
  });
}

export async function killE2bSandbox(sandboxId: string) {
  const id = sandboxId.trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) throw new Error("Invalid E2B sandbox id");
  return request(`/sandboxes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
