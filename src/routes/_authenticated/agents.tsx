import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ResourceLibraryPage } from "@/components/resource-library-page";

export const Route = createFileRoute("/_authenticated/agents")({
  validateSearch: (search: Record<string, unknown>): { run?: string } => {
    const run = typeof search["run"] === "string" ? search["run"].trim() : "";
    return /^[A-Za-z0-9_-]{1,128}$/.test(run) ? { run } : {};
  },
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
  const { run } = Route.useSearch();
  return (
    <div className="space-y-6">
      <section
        className="mx-auto max-w-3xl space-y-3 rounded-xl border p-4 sm:p-6"
        aria-labelledby="browser-agent-heading"
      >
        <h1 id="browser-agent-heading" className="text-xl font-semibold">
          Browser tasks
        </h1>
        <p className="text-sm text-muted-foreground">
          Use the shared Cloud Browser workspace for agent tasks, saved profiles, live sessions and
          direct control.
        </p>
        <Button asChild>
          <Link to="/cloud-browser" search={{ provider: "tinyfish", ...(run ? { run } : {}) }}>
            {run ? "Continue browser session" : "Open Cloud Browser"}
          </Link>
        </Button>
      </section>
      <ResourceLibraryPage
        resourceType="agent"
        title="Agents"
        description="All AI agents you uploaded in Studio or added from Marketplace. Available across all your projects. Credentials are selected per project."
      />
    </div>
  );
}
