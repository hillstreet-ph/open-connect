export function normalizeAuthHeader(value: unknown): string {
  const header = String(value || "X-API-Key").trim();
  if (
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(header) ||
    /^(authorization|host|cookie|set-cookie|content-|accept|connection|proxy-|sec-|mcp-|x-forwarded-|cf-)/i.test(
      header,
    )
  )
    throw new Error(
      "Use a credential header such as X-API-Key or x-consumer-api-key. Choose Bearer token for Authorization.",
    );
  return header;
}
