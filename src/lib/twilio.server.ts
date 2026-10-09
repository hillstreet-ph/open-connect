class TwilioRequestError extends Error {}

export function twilioFailureResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          provider: "twilio",
          error:
            error instanceof TwilioRequestError
              ? error.message
              : "Twilio connector encountered an internal error.",
        }),
      },
    ],
    isError: true,
  };
}

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
};

const querySchema = { type: "object", additionalProperties: { type: "string" } };
const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const readTools: Tool[] = [
  {
    name: "twilio_account",
    description: "Read the connected Twilio account. Reusable authentication secrets are removed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readAnnotations,
  },
  ...["phone_numbers", "messages", "calls"].map((resource) => ({
    name: `twilio_${resource}`,
    description: `List connected Twilio ${resource.replaceAll("_", " ")}. Query supports Twilio filters and pagination; use next_page_uri parameters for subsequent pages.`,
    inputSchema: {
      type: "object",
      properties: { query: querySchema },
      additionalProperties: false,
    },
    annotations: readAnnotations,
  })),
];

const writeTool: Tool = {
  name: "twilio_request",
  description:
    "Admin-only Twilio phone-number, message or call write. Use an account-relative path such as /IncomingPhoneNumbers/PN…json. DELETE and purchasing a number require confirm=true. Twilio charges and account restrictions still apply.",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["POST", "DELETE"] },
      path: { type: "string" },
      body: { type: "object", additionalProperties: { type: "string" } },
      confirm: { type: "boolean" },
    },
    required: ["method", "path"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

const scopeByTool: Record<string, string> = {
  twilio_account: "account:read",
  twilio_phone_numbers: "phone-numbers:read",
  twilio_messages: "messages:read",
  twilio_calls: "calls:read",
};

export function twilioTools(scopes: string[]): Tool[] {
  const tools = readTools.filter((tool) => scopes.includes(scopeByTool[tool.name]!));
  if (["phone-numbers:write", "messages:write", "calls:write"].some((s) => scopes.includes(s))) {
    tools.push(writeTool);
  }
  return tools;
}

export function twilioResourceScope(path: string, method: string) {
  const action = method === "GET" ? "read" : "write";
  if (path === ".json" || path === "/Balance.json") {
    if (method !== "GET")
      throw new TwilioRequestError("Account mutation is not supported by this connector.");
    return "account:read";
  }
  const match = path.match(
    /^\/(IncomingPhoneNumbers|Messages|Calls)(?:\/((?:PN|SM|MM|CA)[a-f0-9]{32}))?\.json$/i,
  );
  if (!match) throw new TwilioRequestError("Unsupported account-relative Twilio path.");
  const collection = match[1]!;
  const sid = match[2];
  const resources: Record<string, { prefixes: string[]; scope: string }> = {
    IncomingPhoneNumbers: { prefixes: ["PN"], scope: "phone-numbers" },
    Messages: { prefixes: ["SM", "MM"], scope: "messages" },
    Calls: { prefixes: ["CA"], scope: "calls" },
  };
  const resource = resources[collection];
  if (!resource || (sid && !resource.prefixes.includes(sid.slice(0, 2)))) {
    throw new TwilioRequestError("Twilio resource SID does not match its collection.");
  }
  if (method === "DELETE" && !sid)
    throw new TwilioRequestError("DELETE requires a specific Twilio resource.");
  return `${resource.scope}:${action}`;
}

function parameters(value: unknown): URLSearchParams {
  if (value === undefined) return new URLSearchParams();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TwilioRequestError("Twilio parameters must be a flat string-valued object.");
  }
  const entries = Object.entries(value);
  if (entries.length > 100) throw new TwilioRequestError("Too many Twilio parameters.");
  const result = new URLSearchParams();
  for (const [key, item] of entries) {
    if (
      !/^[A-Za-z][A-Za-z0-9.<>]{0,63}$/.test(key) ||
      typeof item !== "string" ||
      item.length > 5000
    ) {
      throw new TwilioRequestError("Invalid Twilio parameter.");
    }
    if (key === "PageSize" && (!/^\d+$/.test(item) || Number(item) < 1 || Number(item) > 1000)) {
      throw new TwilioRequestError("Twilio PageSize must be between 1 and 1000.");
    }
    result.set(key, item);
  }
  return result;
}

function parseBundle(value: string) {
  let bundle: Record<string, unknown>;
  try {
    bundle = JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new TwilioRequestError("Twilio requires a JSON account/API-key credential bundle.");
  }
  if (
    !bundle ||
    typeof bundle !== "object" ||
    typeof bundle.account_sid !== "string" ||
    !/^AC[a-f0-9]{32}$/i.test(bundle.account_sid) ||
    typeof bundle.api_key_sid !== "string" ||
    !/^SK[a-f0-9]{32}$/i.test(bundle.api_key_sid) ||
    typeof bundle.api_key_secret !== "string" ||
    !/^[A-Za-z0-9_-]{16,256}$/.test(bundle.api_key_secret)
  ) {
    throw new TwilioRequestError("Twilio credential bundle is incomplete or invalid.");
  }
  return {
    accountSid: bundle.account_sid,
    keySid: bundle.api_key_sid,
    secret: bundle.api_key_secret,
  };
}

function redactProviderPayload(value: unknown, secret: string): unknown {
  if (typeof value === "string") return value.replaceAll(secret, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redactProviderPayload(item, secret));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(auth_token|api_key_secret|secret|password|access_token|refresh_token)$/i.test(key),
        )
        .map(([key, item]) => [key, redactProviderPayload(item, secret)]),
    );
  }
  return value;
}

export async function callTwilioTool(
  name: string,
  args: Record<string, unknown>,
  context: { scopes: string[]; resolveCredential: () => Promise<string> },
  request: typeof fetch = (input, init) => globalThis.fetch(input, init),
) {
  if (!twilioTools(context.scopes).some((tool) => tool.name === name)) {
    throw new TwilioRequestError("Twilio tool is not granted to this connection.");
  }
  const paths: Record<string, string> = {
    twilio_account: ".json",
    twilio_phone_numbers: "/IncomingPhoneNumbers.json",
    twilio_messages: "/Messages.json",
    twilio_calls: "/Calls.json",
  };
  const isWrite = name === "twilio_request";
  const method = isWrite ? String(args.method ?? "") : "GET";
  if (isWrite && !["POST", "DELETE"].includes(method)) {
    throw new TwilioRequestError("Twilio writes require POST or DELETE.");
  }
  const path = isWrite ? String(args.path ?? "") : paths[name]!;
  const scope = twilioResourceScope(path, method);
  if (!context.scopes.includes(scope))
    throw new TwilioRequestError("Twilio resource scope is not granted.");
  if (
    (method === "DELETE" || (method === "POST" && path === "/IncomingPhoneNumbers.json")) &&
    args.confirm !== true
  ) {
    throw new TwilioRequestError(
      "Deleting a resource or purchasing a number requires confirm=true.",
    );
  }
  const query = parameters(isWrite ? undefined : args.query);
  if (!isWrite && name !== "twilio_account" && !query.has("PageSize")) query.set("PageSize", "50");
  const body = parameters(isWrite ? args.body : undefined);
  if (method === "DELETE" && body.size)
    throw new TwilioRequestError("DELETE does not accept a body.");
  const bundle = parseBundle(await context.resolveCredential());
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${bundle.accountSid}${path}`);
  url.search = query.toString();
  let response: Response;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 30_000);
  try {
    response = await request(url.href, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Basic ${btoa(`${bundle.keySid}:${bundle.secret}`)}`,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(method === "POST" ? { body } : {}),
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(deadline);
    const kind =
      error instanceof Error && /^[A-Za-z]{1,30}$/.test(error.name) ? error.name : "NetworkError";
    const message = error instanceof Error ? error.message : "";
    const reason = /AbortSignal|signal/i.test(message)
      ? "signal unavailable"
      : /Illegal invocation|Illegal receiver/i.test(message)
        ? "invalid fetch receiver"
        : /not permitted|denied|disallowed/i.test(message)
          ? "outbound access denied"
          : /redirect/i.test(message)
            ? "redirect rejected"
            : /fetch failed|Failed to fetch/i.test(message)
              ? "network fetch failed"
              : "request initialization failed";
    throw new TwilioRequestError(
      `Twilio request failed (${kind}: ${reason}); verify provider state before retrying a write.`,
    );
  }
  try {
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { code?: unknown };
      throw new TwilioRequestError(
        `Twilio returned HTTP ${response.status}${typeof payload.code === "number" ? ` (code ${payload.code})` : ""}.`,
      );
    }
    let payload: unknown = null;
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch {
        throw new TwilioRequestError(
          "Twilio returned an invalid JSON response; verify provider state before retrying a write.",
        );
      }
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            provider: "twilio",
            status: response.status,
            data: redactProviderPayload(payload, bundle.secret),
          }),
        },
      ],
      isError: false,
    };
  } finally {
    clearTimeout(deadline);
  }
}
