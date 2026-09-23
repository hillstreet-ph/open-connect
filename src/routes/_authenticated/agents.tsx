import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Plug } from "lucide-react";
import { ResourceLibraryCard } from "@/components/resource-library-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRoles } from "@/hooks/use-roles";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "AI Agents — Open-Connect" },
      {
        name: "description",
        content: "Upload AI agent packages, manage the agent library, and add agents to projects.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const { can } = useRoles();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
            <Bot className="mr-1 size-3" /> Build
          </Badge>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            AI Agents
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Upload reusable AI agent packages, keep them in one agent library, and assign each agent
            to the projects where it should work.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/integrations">
            <Plug className="mr-1 size-3.5" /> MCP integrations
          </Link>
        </Button>
      </div>

      {can("upload_resources") ? (
        <ResourceLibraryCard
          defaultType="agent"
          allowedTypes={["agent"]}
          title="Agent library"
          cardDescription="Upload one or more AI agent packages (.zip, .md, JSON, or YAML). Uploaded agents appear here and can be added directly to a project."
          showProjectAssignment
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Your role cannot upload agent packages. Contact an organization admin.
        </p>
      )}
    </div>
  );
}
