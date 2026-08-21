import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Production defaults so the SPA never boots blank if Cloudflare omit VITE_ at build. */
const PROD_SUPABASE_URL = "https://gnqpwewbgldonarggzax.supabase.co";
const PROD_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_jF4uhaC2ClDPaBCvin9Z6A_c0R4Glx0";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function readEnv(name: string): string {
  const fromVite =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env[name] as string | undefined)
      : undefined;
  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  return (fromVite || fromProcess || "").trim();
}

function createSupabaseClient() {
  const SUPABASE_URL =
    readEnv("VITE_SUPABASE_URL") ||
    readEnv("SUPABASE_URL") ||
    PROD_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    readEnv("SUPABASE_PUBLISHABLE_KEY") ||
    PROD_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const message =
      "Missing Supabase environment variable(s): SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY";
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop) {
    if (!_supabase) _supabase = createSupabaseClient();
    const value = Reflect.get(_supabase as object, prop);
    return typeof value === "function" ? value.bind(_supabase) : value;
  },
});
