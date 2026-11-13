type GitHubClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  repository?: string;
  ref?: string;
  workflow_ref?: string;
};

let jwksCache: { expiresAt: number; keys: JsonWebKey[] } | null = null;

function decodeSegment(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function verifySchedulerOidc(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  request: typeof fetch = fetch,
): Promise<boolean> {
  const segments = token.split(".");
  if (segments.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeSegment(segments[0]!))) as {
      alg?: string;
      kid?: string;
    };
    const claims = JSON.parse(
      new TextDecoder().decode(decodeSegment(segments[1]!)),
    ) as GitHubClaims;
    const validAudience = Array.isArray(claims.aud)
      ? claims.aud.includes("open-connect-scheduler")
      : claims.aud === "open-connect-scheduler";
    if (
      header.alg !== "RS256" ||
      !header.kid ||
      claims.iss !== "https://token.actions.githubusercontent.com" ||
      !validAudience ||
      !claims.exp ||
      claims.exp <= nowSeconds ||
      !claims.iat ||
      claims.iat > nowSeconds + 60 ||
      claims.iat < nowSeconds - 600 ||
      claims.repository !== "hillstreet-ph/open-connect" ||
      claims.ref !== "refs/heads/main" ||
      claims.workflow_ref !==
        "hillstreet-ph/open-connect/.github/workflows/scheduler-runner.yml@refs/heads/main"
    )
      return false;

    if (!jwksCache || jwksCache.expiresAt <= Date.now()) {
      const response = await request(
        "https://token.actions.githubusercontent.com/.well-known/jwks",
        {
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) return false;
      const body = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
      jwksCache = { expiresAt: Date.now() + 5 * 60_000, keys: body.keys ?? [] };
    }
    const jwk = jwksCache.keys.find(
      (key) => (key as JsonWebKey & { kid?: string }).kid === header.kid,
    );
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      new Uint8Array(decodeSegment(segments[2]!)).buffer,
      new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
    );
  } catch {
    return false;
  }
}
