import { createFileRoute, redirect } from "@tanstack/react-router";

/** Canonical login URL used after Sign out. Reuses /auth UI. */
export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: "signin" | "signup" | "reset" } => {
    const raw = search["mode"];
    return raw === "signup" || raw === "reset" ? { mode: raw } : {};
  },
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth",
      search: search.mode ? { mode: search.mode } : {},
      replace: true,
    });
  },
});
