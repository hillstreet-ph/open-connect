const MAX_BYTES = 65536;

export async function hashWebhookSecret(secret: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function readWebhookJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) {
        await reader.cancel();
        throw new Error("body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const invalidText = (value: string) =>
    value.includes(String.fromCharCode(0)) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(data),
    (key, value: unknown) => {
      if (
        invalidText(key) ||
        (typeof value === "string" && invalidText(value)) ||
        (typeof value === "number" && !Number.isFinite(value))
      )
        throw new Error("Unsupported JSON value");
      return value;
    },
  );
}

export type IncomingWebhookStore = {
  lookup(id: string): Promise<{ id: string; user_id: string; secret_hash: string } | null>;
  save(input: {
    webhook_id: string;
    user_id: string;
    delivery_id: string;
    payload: unknown;
  }): Promise<"saved" | "duplicate">;
};

export async function receiveIncomingWebhook(
  request: Request,
  id: string,
  store: IncomingWebhookStore,
): Promise<Response> {
  const reply = (message: string, status: number) => Response.json({ message }, { status });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return reply("Not found", 404);
  const secret = request.headers.get("x-open-connect-secret") ?? "";
  const deliveryId = request.headers.get("x-open-connect-delivery-id")?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/.test(secret)) return reply("Unauthorized", 401);
  if (!deliveryId || deliveryId.length > 200) return reply("A delivery ID is required", 400);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? ""))
    return reply("JSON required", 415);
  let hook: Awaited<ReturnType<IncomingWebhookStore["lookup"]>>;
  try {
    hook = await store.lookup(id);
  } catch {
    return reply("Receiver unavailable", 503);
  }
  if (!hook || !constantTimeEqual(await hashWebhookSecret(secret), hook.secret_hash))
    return reply("Unauthorized", 401);
  let payload: unknown;
  try {
    payload = await readWebhookJson(request);
  } catch {
    return reply("Invalid or oversized JSON", 400);
  }
  if (payload === null) return reply("JSON null is not supported", 400);
  try {
    const result = await store.save({
      webhook_id: hook.id,
      user_id: hook.user_id,
      delivery_id: deliveryId,
      payload,
    });
    return result === "duplicate" ? reply("Already received", 200) : reply("Received", 202);
  } catch {
    return reply("Could not save delivery", 503);
  }
}
