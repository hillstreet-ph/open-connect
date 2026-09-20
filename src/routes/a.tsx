import { createFileRoute, redirect } from "@tanstack/react-router";

/** Backward-compatible short sign-in URL used by older links and mobile bookmarks. */
export const Route = createFileRoute("/a")({
  beforeLoad: () => {
    throw redirect({
      to: "/auth",
      replace: true,
    });
  },
});
