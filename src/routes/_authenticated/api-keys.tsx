import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/api-keys")({
  beforeLoad: () => { throw redirect({ to: "/integrations", replace: true }); },
});
