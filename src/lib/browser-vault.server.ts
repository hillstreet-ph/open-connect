import { normalizeConnectionSetup } from "./connection-setup";
import { validateConnectionCredential } from "./connection-validation.server";

export type VaultBrowserProvider = "browser_use" | "browserbase";
export type VaultBrowserMetadata = {
  id: string;
  secret_type: string;
  website: string | null;
  tags: string[];
};
const origins = {
  browser_use: [
    "https://browser-use.com",
    "https://cloud.browser-use.com",
    "https://api.browser-use.com",
  ],
  browserbase: [
    "https://browserbase.com",
    "https://www.browserbase.com",
    "https://api.browserbase.com",
  ],
};
/** No fuzzy names, passwords, cross-provider tags or arbitrary endpoints. */
export function matchingBrowserKeys(provider: VaultBrowserProvider, rows: VaultBrowserMetadata[]) {
  return rows.filter((row) => {
    if (row.secret_type !== "api_key") return false;
    const tags = row.tags.filter((tag) => tag.startsWith("provider:"));
    if (tags.length) return tags.every((tag) => tag === `provider:${provider}`);
    try {
      const url = new URL(row.website ?? "");
      return !url.username && !url.password && origins[provider].includes(url.origin);
    } catch {
      return false;
    }
  });
}
export async function reuseBrowserKey(
  provider: VaultBrowserProvider,
  dependencies: {
    hasConnection: () => Promise<boolean>;
    metadata: () => Promise<VaultBrowserMetadata[]>;
    resolve: (reference: string) => Promise<string>;
    validate: (key: string) => Promise<void>;
    bind: (id: string, reference: string) => Promise<void>;
  },
): Promise<"existing" | "missing" | "ambiguous" | "connected" | "unavailable"> {
  try {
    if (await dependencies.hasConnection()) return "existing";
    const matches = matchingBrowserKeys(provider, await dependencies.metadata());
    if (!matches.length) return "missing";
    if (matches.length !== 1) return "ambiguous";
    const id = matches[0]!.id;
    const reference = `credential://${provider}/${id}`;
    const key = await dependencies.resolve(reference);
    if (!key.trim()) return "unavailable";
    await dependencies.validate(key);
    await dependencies.bind(id, reference);
    return "connected";
  } catch {
    // Never forward resolver, database or upstream error bodies containing credentials.
    return "unavailable";
  }
}

/** Authenticated callers only; no browser run or copied Vault secret is created. */
export async function prepareBrowserVaultConnection(
  userId: string,
  provider: VaultBrowserProvider,
) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const name = provider === "browser_use" ? "Browser Use" : "Browserbase";
  return reuseBrowserKey(provider, {
    async hasConnection() {
      const { data, error } = await db
        .from("app_connections")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", provider)
        .eq("status", "connected")
        .like("credential_reference", "credential://%")
        .limit(1);
      if (error) throw new Error("Connection lookup failed");
      return Boolean(data?.length);
    },
    async metadata() {
      const { data, error } = await db
        .from("credential_secrets")
        .select("id,secret_type,website,tags")
        .eq("user_id", userId)
        .eq("secret_type", "api_key");
      if (error) throw new Error("Metadata lookup failed");
      return data ?? [];
    },
    async resolve(reference) {
      return (await import("./custom-mcp.server")).resolveCredential(userId, reference);
    },
    async validate(api_key) {
      const validation = await validateConnectionCredential(
        normalizeConnectionSetup(
          { provider, api_key, auth_type: "api_key" },
          { provider, display_name: name, scopes: [], oauth: false },
        ),
      );
      if (!validation.verified) throw new Error("Key not verified");
    },
    async bind(id, reference) {
      const { error } = await db.from("app_connections").upsert(
        {
          user_id: userId,
          provider,
          provider_account_id: `vault-${id}`,
          display_name: `${name} · saved credential`,
          credential_reference: reference,
          status: "connected",
          scopes: [],
          metadata: {
            source: "open-connect",
            mode: "api_key",
            auth_type: "api_key",
            credential_reuse: true,
          },
        },
        { onConflict: "user_id,provider,provider_account_id", ignoreDuplicates: true },
      );
      if (error) throw new Error("Connection binding failed");
      const { data, error: readError } = await db
        .from("app_connections")
        .select("status,credential_reference")
        .eq("user_id", userId)
        .eq("provider", provider)
        .eq("provider_account_id", `vault-${id}`)
        .single();
      if (readError || data?.status !== "connected" || data.credential_reference !== reference)
        throw new Error("Connection binding was not confirmed");
    },
  });
}

/** Explicit opaque-reference setup, verified before the MCP route writes a binding. */
export async function validateOwnedBrowserReference(
  userId: string,
  provider: VaultBrowserProvider,
  reference: string,
) {
  if (!new RegExp(`^credential://${provider}/[0-9a-f-]{36}$`, "i").test(reference))
    throw new Error("An owned provider credential reference is required.");
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential, error } = await supabaseAdmin
      .from("credential_secrets")
      .select("id")
      .eq("user_id", userId)
      .eq("id", reference.split("/").pop()!)
      .eq("secret_type", "api_key")
      .maybeSingle();
    if (error || !credential) throw new Error("Owned API key required");
    const api_key = await (
      await import("./custom-mcp.server")
    ).resolveCredential(userId, reference);
    const validation = await validateConnectionCredential(
      normalizeConnectionSetup(
        { provider, api_key, auth_type: "api_key" },
        { provider, display_name: provider, scopes: [], oauth: false },
      ),
    );
    if (!validation.verified) throw new Error("Not verified");
    return {
      credential_reuse: true,
      validation: {
        verified: true,
        checked_at: new Date().toISOString(),
        detail: validation.detail,
      },
    };
  } catch {
    throw new Error(
      "Saved browser credential could not be verified. Check the key and provider account.",
    );
  }
}
