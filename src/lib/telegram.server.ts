class TelegramRequestError extends Error {}

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
};

const emptySchema = { type: "object", properties: {}, additionalProperties: false };
const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const catalog: Tool[] = [
  {
    name: "telegram_bot",
    description: "Read the connected Telegram bot identity. No token is returned.",
    inputSchema: emptySchema,
    annotations: readAnnotations,
  },
  {
    name: "telegram_destination",
    description: "Read the saved Telegram destination chat and topic configuration.",
    inputSchema: emptySchema,
    annotations: readAnnotations,
  },
  {
    name: "telegram_send_message",
    description:
      "Admin-only message to the saved Telegram group topic. Destination overrides, formatting and paid broadcasts are unavailable. A failed topic never falls back to the general chat.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: 4096 } },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
];

export function telegramTools(scopes: string[]): Tool[] {
  return catalog.filter((tool) =>
    scopes.includes(tool.name === "telegram_send_message" ? "messages:send" : "inbound:telegram"),
  );
}

export function telegramDestination(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TelegramRequestError("Telegram group topic is not configured.");
  }
  const metadata = value as Record<string, unknown>;
  const chatId = metadata["telegram_chat_id"];
  const topic = metadata["telegram_message_thread_id"];
  if (
    typeof chatId !== "string" ||
    !/^-100[1-9]\d{0,12}$/.test(chatId) ||
    !Number.isSafeInteger(Number(chatId)) ||
    typeof topic !== "number" ||
    !Number.isSafeInteger(topic) ||
    topic < 1
  ) {
    throw new TelegramRequestError(
      "A numeric Telegram supergroup and positive topic ID are required.",
    );
  }
  return { chat_id: chatId, message_thread_id: topic };
}

export function telegramFailureResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          provider: "telegram",
          error:
            error instanceof TelegramRequestError
              ? error.message
              : "Telegram connector encountered an internal error.",
        }),
      },
    ],
    isError: true,
  };
}

function redact(value: unknown, token: string): unknown {
  if (typeof value === "string") return value.replaceAll(token, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redact(item, token));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !/^(token|bot_token|password|secret|access_token|refresh_token)$/i.test(key),
        )
        .map(([key, item]) => [key, redact(item, token)]),
    );
  }
  return value;
}

export async function callTelegramTool(
  name: string,
  args: Record<string, unknown>,
  context: {
    scopes: string[];
    metadata: unknown;
    resolveCredential: () => Promise<string>;
  },
  request: typeof fetch = (input, init) => globalThis.fetch(input, init),
) {
  if (!telegramTools(context.scopes).some((tool) => tool.name === name)) {
    throw new TelegramRequestError("Telegram tool is not granted to this connection.");
  }
  const write = name === "telegram_send_message";
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => !write || key !== "text") ||
    (write &&
      (typeof args["text"] !== "string" || !args["text"].trim() || args["text"].length > 4096))
  ) {
    throw new TelegramRequestError(
      "Invalid Telegram arguments; destination overrides are rejected.",
    );
  }
  const destination = name === "telegram_bot" ? null : telegramDestination(context.metadata);
  const body = write
    ? {
        ...destination,
        text: args["text"],
        protect_content: true,
        link_preview_options: { is_disabled: true },
      }
    : destination
      ? { chat_id: destination.chat_id }
      : {};
  const token = await context.resolveCredential();
  if (!/^\d{1,20}:[A-Za-z0-9_-]{20,256}$/.test(token)) {
    throw new TelegramRequestError("Telegram requires a valid bot-token credential.");
  }
  const method = write ? "sendMessage" : destination ? "getChat" : "getMe";
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 30_000);
  try {
    let response: Response;
    try {
      response = await request(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      throw new TelegramRequestError(
        "Telegram request failed; verify provider state before retrying a message.",
      );
    }
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: unknown;
      error_code?: number;
    } | null;
    if (!response.ok || payload?.ok !== true) {
      throw new TelegramRequestError(
        `Telegram returned HTTP ${response.status}${Number.isSafeInteger(payload?.error_code) ? ` (code ${payload!.error_code})` : ""}; no alternate destination was attempted.`,
      );
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            provider: "telegram",
            status: response.status,
            data: redact(payload.result, token),
            ...(destination ? { destination } : {}),
          }),
        },
      ],
      isError: false,
    };
  } finally {
    clearTimeout(deadline);
  }
}
