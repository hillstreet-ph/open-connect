import { createFileRoute, redirect } from "@tanstack/react-router";

import { safeAuthReturn } from "@/lib/auth-return";

/** Canonical login URL used after Sign out. Reuses /auth UI. */
export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode?: "signin" | "signup" | "reset"; returnTo?: string } => {
    const raw = search["mode"];
    return {
      ...(raw === "signup" || raw === "reset" ? { mode: raw } : {}),
      returnTo: safeAuthReturn(search["returnTo"]),
    };
  },
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth",
      search,
      replace: true,
    });
  },
});
