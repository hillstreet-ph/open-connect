const READ_ACTIONS = [
  "search",
  "fetch",
  "open_connect_status",
  "list_resources",
  "list_connections",
  "list_models",
  "inspect_connections",
  "plan_goal",
  "recommend_toolchain",
  "resolve_capability",
] as const;

const WRITE_ACTIONS = [
  "execute_plan",
  "create_capability_draft",
  "record_run_outcome",
  "install_capability",
  "configure_connection",
] as const;

export type ChatGptActionMode = "read" | "write";

export const CHATGPT_ACTIONS = {
  read: new Set<string>(READ_ACTIONS),
  write: new Set<string>(WRITE_ACTIONS),
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "https://chatgpt.com",
      vary: "Origin",
    },
  });
}

export function chatGptActionOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "https://chatgpt.com",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}

export async function forwardChatGptAction(request: Request, mode: ChatGptActionMode) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    input?: unknown;
  } | null;
  const action = typeof body?.action === "string" ? body.action.trim() : "";
  if (!CHATGPT_ACTIONS[mode].has(action)) {
    return json(
      {
        error: {
          code: "unsupported_action",
          message: `Use one of the documented ${mode} actions.`,
        },
      },
      400,
    );
  }

  const input =
    body?.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? (body.input as Record<string, unknown>)
      : {};
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return json(
      { error: { code: "invalid_api_key", message: "OAuth or bearer authentication required." } },
      401,
    );
  }

  const mcpUrl = new URL("/mcp", request.url);
  const upstream = await fetch(mcpUrl, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: action, arguments: input },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await upstream.json().catch(() => null)) as {
    error?: unknown;
    result?: { content?: Array<{ type?: string; text?: string }> };
  } | null;

  if (!upstream.ok || payload?.error) {
    return json(
      payload ?? { error: { code: "gateway_error", message: "Gateway unavailable." } },
      upstream.status,
    );
  }

  const text = payload?.result?.content?.find((item) => item.type === "text")?.text;
  let result: unknown = payload?.result ?? null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = { text };
    }
  }
  return json({ ok: true, action, mode, result });
}
