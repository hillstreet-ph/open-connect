import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";
export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({
    meta: [{ title: "Tools — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ResourceLibraryPage
      resourceType="tool"
      title="Tools"
      description="Installed Tools available across your projects."
    />
  ),
});
