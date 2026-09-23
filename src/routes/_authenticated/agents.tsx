import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "AI Agents — Open-Connect" },
      { name: "description", content: "Your uploaded and Marketplace-added AI agents." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <ResourceLibraryPage
      resourceType="agent"
      title="Agents"
      description="All AI agents you uploaded in Studio or added from Marketplace. Share each agent with one or more projects here."
    />
  );
}
