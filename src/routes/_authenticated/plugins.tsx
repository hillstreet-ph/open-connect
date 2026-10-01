import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";

export const Route = createFileRoute("/_authenticated/plugins")({
  head: () => ({
    meta: [
      { title: "Plugins — Open-Connect" },
      { name: "description", content: "Your uploaded and Marketplace-added plugins." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PluginsPage,
});

function PluginsPage() {
  return (
    <ResourceLibraryPage
      resourceType="plugin"
      title="Plugins"
      description="All plugins you uploaded in Studio or added from Marketplace. Share each plugin with one or more projects here."
    />
  );
}
