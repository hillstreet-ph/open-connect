import { createFileRoute } from "@tanstack/react-router";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-terminal")({
  head: () => ({
    meta: [{ title: "Cloud Terminal — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <CloudWorkspacePage kind="terminal" />,
});
