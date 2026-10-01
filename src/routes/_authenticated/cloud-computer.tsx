import { createFileRoute } from "@tanstack/react-router";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-computer")({
  head: () => ({
    meta: [{ title: "Cloud Computer — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <CloudWorkspacePage kind="computer" />,
});
