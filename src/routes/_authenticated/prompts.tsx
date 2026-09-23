import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";

export const Route = createFileRoute("/_authenticated/prompts")({
  head: () => ({
    meta: [
      { title: "Prompts — Open-Connect" },
      { name: "description", content: "Your uploaded and Marketplace-added prompts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PromptsPage,
});

function PromptsPage() {
  return (
    <ResourceLibraryPage
      resourceType="prompt"
      title="Prompts"
      description="All prompts you uploaded in Studio or added from Marketplace. Share each prompt with one or more projects here."
    />
  );
}
