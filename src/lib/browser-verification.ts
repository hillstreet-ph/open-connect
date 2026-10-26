import { z } from "zod";

export const browserPreferences = z.object({
  native_assistance: z.boolean().default(false),
  external_assistance: z.boolean().default(false),
});
export const defaultBrowserPreferences = { native_assistance: false, external_assistance: false };
export type BrowserPreferences = z.infer<typeof browserPreferences>;
export const challengeType = z.enum(["recaptcha_v2", "turnstile"]);
export type BrowserChallengeType = z.infer<typeof challengeType>;
export function verificationPage(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ||
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
    /(?:\.local|\.localhost|\.internal)$/.test(url.hostname) ||
    url.hostname.startsWith("[")
  )
    throw new Error("Use a public HTTPS page without embedded credentials.");
  for (const key of url.searchParams.keys())
    if (/^(?:password|access_token|refresh_token|api_key|authorization|code)$/i.test(key))
      throw new Error("Remove sensitive sign-in parameters before requesting verification.");
  url.hash = "";
  return url.toString();
}
export const verificationInput = z.object({
  requestId: z.string().uuid(),
  browser: z.string().regex(/^[a-z0-9_-]{1,80}$/),
  browserRef: z.string().regex(/^[A-Za-z0-9:._-]{1,180}$/),
  pageUrl: z.string().max(2048).transform(verificationPage),
  type: challengeType,
  siteKey: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
  spendApproved: z.literal(true),
});
export type VerificationInput = z.infer<typeof verificationInput>;
export function solverTask(input: VerificationInput) {
  return {
    type: input.type === "recaptcha_v2" ? "RecaptchaV2TaskProxyless" : "TurnstileTaskProxyless",
    websiteURL: input.pageUrl,
    websiteKey: input.siteKey,
  };
}
export type SolverMetadata = {
  id: string;
  secret_type: string;
  website: string | null;
  tags: string[];
};
export function matchingSolverKeys(rows: SolverMetadata[]) {
  return rows.filter((row) => {
    if (row.secret_type !== "api_key") return false;
    const tags = (row.tags ?? []).filter((tag) => tag.startsWith("provider:"));
    if (tags.length) return tags.every((tag) => tag === "provider:two_captcha");
    try {
      const url = new URL(row.website ?? "");
      return (
        !url.username &&
        !url.password &&
        ["https://2captcha.com", "https://www.2captcha.com", "https://api.2captcha.com"].includes(
          url.origin,
        )
      );
    } catch {
      return false;
    }
  });
}
export class SolverResponseError extends Error {
  definite: boolean;
  constructor(message: string, definite = false) {
    super(message);
    this.definite = definite;
  }
}
/** Only fixed provider endpoints receive the owned Vault key; never log request/response bodies. */
export async function solverRequest(
  apiKey: string,
  method: "createTask" | "getTaskResult" | "getBalance",
  payload: Record<string, unknown>,
  send: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await send(`https://api.2captcha.com/${method}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, clientKey: apiKey }),
    });
  } catch {
    throw new SolverResponseError(
      "The solver request could not be confirmed. Do not submit a duplicate task.",
    );
  }
  if (!response.ok)
    throw new SolverResponseError(`Solver HTTP ${response["status"]}; completion is unverified.`);
  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new SolverResponseError("Solver response could not be verified.");
  }
  if (body["errorId"] !== 0)
    throw new SolverResponseError(
      "The solver rejected the request. Check account authorization and balance.",
      true,
    );
  return body;
}
export function solverSolution(type: BrowserChallengeType, body: Record<string, unknown>) {
  const solution = body["solution"] as Record<string, unknown> | undefined;
  const value = type === "recaptcha_v2" ? solution?.["gRecaptchaResponse"] : solution?.["token"];
  if (typeof value !== "string" || !value || value.length > 32000)
    throw new Error("Solver proof is unavailable.");
  return value;
}
