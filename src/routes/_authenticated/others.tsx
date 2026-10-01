import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";

export const Route = createFileRoute("/_authenticated/others")({
  head: () => ({
    meta: [{ title: "Others — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ResourceLibraryPage
      otherTypesOnly
      title="Others"
      description="Installed MCP servers, apps, tools, models, and other resources."
    />
  ),
});
