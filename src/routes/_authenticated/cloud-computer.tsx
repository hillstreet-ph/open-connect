import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/cloud-computer")({
  beforeLoad: () => {
    throw redirect({ to: "/cloud-browser", search: { mode: "computer" } });
  },
});
