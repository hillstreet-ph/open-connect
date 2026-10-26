import { createFileRoute, redirect } from "@tanstack/react-router";

/** Keep saved overview links working without a duplicate Cloud landing page. */
export const Route = createFileRoute("/_authenticated/cloud")({
  beforeLoad: () => {
    throw redirect({ to: "/cloud-sandbox", replace: true });
  },
});
