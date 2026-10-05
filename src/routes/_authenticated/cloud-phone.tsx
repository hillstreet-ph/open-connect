import { createFileRoute } from "@tanstack/react-router";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-phone")({
  head: () => ({
    meta: [{ title: "Cloud Phone — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <CloudWorkspacePage kind="phone" />,
});
