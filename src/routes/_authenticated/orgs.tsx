import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/orgs")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", hash: "organization" });
  },
});
