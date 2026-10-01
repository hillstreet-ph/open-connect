import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [{ title: "Installed Resources — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ResourceLibraryPage
      title="Installed Resources"
      description="Install once. Use across all your projects and connected workflows. Manage project credentials separately in each project."
    />
  ),
});
