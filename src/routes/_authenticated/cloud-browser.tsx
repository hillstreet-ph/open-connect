import { createFileRoute } from "@tanstack/react-router";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-browser")({
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <CloudWorkspacePage kind="browser" />,
});
