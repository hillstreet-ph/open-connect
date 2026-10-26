import type { SupabaseClient } from "@supabase/supabase-js";
import {
  browserPreferences,
  defaultBrowserPreferences,
  matchingSolverKeys,
  verificationInput,
  solverTask,
  solverRequest,
  solverSolution,
  SolverResponseError,
  type BrowserPreferences,
  type VerificationInput,
  type SolverMetadata,
} from "./browser-verification.ts";

async function database() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as SupabaseClient;
}
export async function readBrowserPreferences(
  userId: string,
  supplied?: SupabaseClient,
): Promise<BrowserPreferences> {
  const db = supplied ?? (await database());
  const { data, error } = await db
    .from("browser_automation_preferences")
    .select("native_assistance,external_assistance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Global browser preferences could not be loaded.");
  return browserPreferences.parse(data ?? defaultBrowserPreferences);
}
export async function saveBrowserPreferences(
  userId: string,
  input: unknown,
  supplied?: SupabaseClient,
) {
  const data = browserPreferences.parse(input);
  const db = supplied ?? (await database());
  const { error } = await db
    .from("browser_automation_preferences")
    .upsert({ user_id: userId, ...data, updated_at: new Date().toISOString() });
  if (error) throw new Error("Global browser preferences could not be saved.");
  return data;
}
async function solverMetadata(userId: string, db: SupabaseClient) {
  const { data, error } = await db
    .from("credential_secrets")
    .select("id,secret_type,website,tags")
    .eq("user_id", userId)
    .eq("secret_type", "api_key");
  if (error) throw new Error("Solver credential metadata could not be checked.");
  return matchingSolverKeys((data ?? []) as SolverMetadata[]);
}
async function ownedSolverKey(userId: string, credentialId?: string) {
  const db = await database();
  const matches = await solverMetadata(userId, db);
  const match = credentialId
    ? matches.find((row) => row.id === credentialId)
    : matches.length === 1
      ? matches[0]
      : undefined;
  if (!match)
    throw new Error(
      matches.length > 1
        ? "Several solver keys match. Keep one canonical 2Captcha credential in Credentials."
        : "Save your 2Captcha API key in Credentials with website https://2captcha.com and tag provider:two_captcha.",
    );
  const { resolveCredential } = await import("./custom-mcp.server");
  const key = await resolveCredential(userId, `credential://two_captcha/${match.id}`);
  if (!key?.trim()) throw new Error("The owned solver key is unavailable.");
  return { key, id: match.id };
}
export async function globalBrowserStatus(userId: string) {
  const db = await database();
  const [preferences, keys] = await Promise.all([
    readBrowserPreferences(userId, db),
    solverMetadata(userId, db),
  ]);
  return {
    scope: "all_owned_browsers_and_authorized_ai_clients",
    preferences,
    external: {
      provider: "two_captcha",
      credential_state: keys.length === 1 ? "saved" : keys.length > 1 ? "ambiguous" : "missing",
      supported_challenges: ["recaptcha_v2", "turnstile"],
      live_execution_verified: false,
    },
    providers: {
      tinyfish: {
        controls: ["agent_tasks", "profiles", "pointer", "keyboard", "paste", "tabs", "live_view"],
        verification: "shared_external_or_same_session_handoff",
      },
      browser_use: {
        controls: ["agent_tasks", "live_view", "bounded_cost", "cancel"],
        verification: "provider_managed_automatic",
      },
      browserbase: {
        controls: ["manual_live_session", "session_status", "release"],
        verification: preferences.native_assistance
          ? "native_requested_for_new_sessions"
          : "native_not_requested",
      },
      connected_workers: {
        controls: "discovered_per_owned_worker",
        verification: "shared_external_api_with_same_session_proof_application",
      },
    },
    tools: [
      "browser_automation_status",
      "browser_automation_configure",
      "browser_verification_start",
      "browser_verification_result",
    ],
    credential_setup: {
      url: "https://open-connect.site/secrets",
      website: "https://2captcha.com",
      tag: "provider:two_captcha",
    },
    note: "A solver proof is not evidence that the website accepted verification. Preserve the same browser reference and origin. MFA, sign-in and unresolved challenges retain their normal handoff.",
  };
}
export function sameVerificationRequest(row: Record<string, unknown>, input: VerificationInput) {
  return (
    row["browser"] === input.browser &&
    row["browser_ref"] === input.browserRef &&
    row["page_url"] === input.pageUrl &&
    row["challenge_type"] === input.type &&
    row["site_key"] === input.siteKey
  );
}
type VerificationDependencies = {
  db: SupabaseClient;
  credential: (userId: string, id?: string) => Promise<{ key: string; id: string }>;
  send?: typeof fetch;
};
export async function beginVerification(
  userId: string,
  input: unknown,
  dependencies?: VerificationDependencies,
) {
  const data = verificationInput.parse(input);
  const db = dependencies?.db ?? (await database());
  const preferences = await readBrowserPreferences(userId, db);
  if (!preferences.external_assistance)
    throw new Error(
      "Enable external assistance in global Browser automation settings before incurring solver charges.",
    );
  const credential = await (dependencies?.credential ?? ownedSolverKey)(userId);
  const { error } = await db.from("browser_verification_attempts").insert({
    id: data.requestId,
    user_id: userId,
    browser: data.browser,
    browser_ref: data.browserRef,
    page_url: data.pageUrl,
    challenge_type: data.type,
    site_key: data.siteKey,
    credential_id: credential.id,
    state: "submitting",
  });
  if (error) {
    if (error.code !== "23505")
      throw new Error("Could not record verification attempt. No solver request was sent.");
    const { data: existing, error: readError } = await db
      .from("browser_verification_attempts")
      .select("id,state,browser,browser_ref,page_url,challenge_type,site_key")
      .eq("id", data.requestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError || !existing || !sameVerificationRequest(existing, data))
      throw new Error("Verification request ID is unavailable or belongs to a different request.");
    return { id: data.requestId, state: existing.state, resumed: true };
  }
  let taskId: number;
  try {
    const result = await solverRequest(
      credential.key,
      "createTask",
      { task: solverTask(data) },
      dependencies?.send ?? fetch,
    );
    if (
      typeof result["taskId"] !== "number" ||
      !Number.isSafeInteger(result["taskId"]) ||
      result["taskId"] <= 0
    )
      throw new SolverResponseError("Solver submission could not be verified.");
    taskId = result["taskId"];
  } catch (failure) {
    const state =
      failure instanceof SolverResponseError && failure.definite ? "failed" : "submission_unknown";
    await db
      .from("browser_verification_attempts")
      .update({ state, updated_at: new Date().toISOString() })
      .eq("id", data.requestId)
      .eq("user_id", userId);
    // Provider errors can include credentials; retain only the explicit safe attempt state.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `Verification attempt ${data.requestId}: ${state}. Check the existing attempt before retrying; do not create a duplicate charge.`,
    );
  }
  const { error: saved } = await db
    .from("browser_verification_attempts")
    .update({ task_id: taskId, state: "processing", updated_at: new Date().toISOString() })
    .eq("id", data.requestId)
    .eq("user_id", userId);
  if (saved)
    throw new Error(
      `Verification attempt ${data.requestId} was submitted, but recording its reference failed. Do not resubmit.`,
    );
  return { id: data.requestId, state: "processing", resumed: false };
}
export async function readVerification(
  userId: string,
  id: string,
  dependencies?: VerificationDependencies,
) {
  const db = dependencies?.db ?? (await database());
  const { data, error } = await db
    .from("browser_verification_attempts")
    .select("id,state,browser,browser_ref,page_url,challenge_type,credential_id,task_id,created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Verification attempt is unavailable for this account.");
  const bound = {
    id,
    browser: data.browser as string,
    browserRef: data.browser_ref as string,
    origin: new URL(data.page_url as string).origin,
  };
  if (["failed", "submission_unknown", "submitting"].includes(data.state as string))
    return { ...bound, state: data.state as string, website_acceptance_verified: false as const };
  if (Date.now() - Date.parse(data.created_at as string) > 10 * 60 * 1000)
    return { ...bound, state: "expired", website_acceptance_verified: false as const };
  const { key } = await (dependencies?.credential ?? ownedSolverKey)(
    userId,
    data.credential_id as string,
  );
  let response: Record<string, unknown>;
  try {
    response = await solverRequest(
      key,
      "getTaskResult",
      { taskId: data.task_id },
      dependencies?.send ?? fetch,
    );
  } catch (failure) {
    if (failure instanceof SolverResponseError && failure.definite) {
      await db
        .from("browser_verification_attempts")
        .update({ state: "failed", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
    }
    throw failure;
  }
  if (response["status"] === "processing")
    return { ...bound, state: "processing", website_acceptance_verified: false as const };
  if (response["status"] !== "ready") throw new Error("Solver status could not be verified.");
  const token = solverSolution(data.challenge_type as "recaptcha_v2" | "turnstile", response);
  const { error: updateError } = await db
    .from("browser_verification_attempts")
    .update({ state: "ready", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (updateError) throw new Error("Proof is ready but attempt tracking could not be updated.");
  return {
    ...bound,
    state: "ready",
    type: data.challenge_type as "recaptcha_v2" | "turnstile",
    proof: token,
    website_acceptance_verified: false as const,
  };
}
