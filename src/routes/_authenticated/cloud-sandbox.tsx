import { createFileRoute } from "@tanstack/react-router";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";
export const Route = createFileRoute("/_authenticated/cloud-sandbox")({
  head: () => ({
    meta: [{ title: "Sandbox — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <CloudWorkspacePage kind="sandbox" />,
});
