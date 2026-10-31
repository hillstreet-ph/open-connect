import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/roles")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", hash: "organization" });
  },
});
