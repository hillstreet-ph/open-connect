/**
 * Legacy stub from the original scaffold.
 * Open-Connect uses native Supabase Auth only (email, GitHub, Google).
 * Do not route production sign-in through third-party cloud builders.
 */

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

/**
 * Compatibility no-op surface. Prefer `supabase.auth.signInWithOAuth`
 * from `@/integrations/supabase/client` in app code.
 */
export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "github",
      opts?: SignInOptions,
    ) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri ?? `${typeof window !== "undefined" ? window.location.origin : ""}/auth`,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { error, redirected: false as const };
      return { data, redirected: true as const, error: null };
    },
  },
};
