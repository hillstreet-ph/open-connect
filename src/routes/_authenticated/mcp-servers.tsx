import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";
export const Route = createFileRoute("/_authenticated/mcp-servers")({
  head: () => ({ meta: [{ title: "MCP — Open-Connect" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ResourceLibraryPage
      resourceType="mcp"
      title="MCP"
      description="Installed MCP available across your projects."
    />
  ),
});
