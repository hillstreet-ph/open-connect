import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

import { PLATFORM_SUPABASE_URL, PLATFORM_SUPABASE_PUBLIC_KEY } from "./public-config";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseClient() {
  const SUPABASE_URL = PLATFORM_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = PLATFORM_SUPABASE_PUBLIC_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const message =
      "Missing Supabase environment variable(s): SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY";
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
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
