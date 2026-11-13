import { createFileRoute, redirect } from "@tanstack/react-router";

import { safeAuthReturn } from "@/lib/auth-return";

/** Backward-compatible short sign-in URL used by older links and mobile bookmarks. */
export const Route = createFileRoute("/a")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeAuthReturn(search["returnTo"]),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth",
      search,
      replace: true,
    });
  },
});
