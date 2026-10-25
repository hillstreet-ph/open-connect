import { createFileRoute } from "@tanstack/react-router";
import { BrowserAgentChat } from "@/components/browser-agent-chat";
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
  const navigate = Route.useNavigate();
  return (
    <div className="space-y-6">
      <section
        className="mx-auto max-w-3xl space-y-3 rounded-xl border p-4 sm:p-6"
        aria-labelledby="browser-agent-heading"
      >
        <h1 id="browser-agent-heading" className="text-xl font-semibold">
          Execute a browser task
        </h1>
        <BrowserAgentChat
          runId={run}
          onSelectRun={(id) => void navigate({ search: id ? { run: id } : {}, replace: false })}
        />
      </section>
      <ResourceLibraryPage
        resourceType="agent"
        title="Agents"
        description="All AI agents you uploaded in Studio or added from Marketplace. Available across all your projects. Credentials are selected per project."
      />
    </div>
  );
}
