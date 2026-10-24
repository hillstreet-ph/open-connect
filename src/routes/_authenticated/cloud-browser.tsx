import { createFileRoute } from "@tanstack/react-router";
import { CloudBrowserConsole } from "@/components/cloud-browser-console";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (search: Record<string, unknown>): { run?: string } => {
    const run = typeof search["run"] === "string" ? search["run"].trim() : "";
    return /^[A-Za-z0-9_-]{1,128}$/.test(run) ? { run } : {};
  },
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudBrowserRoute,
});

function CloudBrowserRoute() {
  const { run } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Cloud Browser</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A real cloud Chrome with your saved sign-ins. Watch it live here, or let any AI agent
          connected to open-connect.site/mcp drive it.
        </p>
      </header>
      <CloudBrowserConsole
        {...(run ? { runId: run } : {})}
        onSelectRun={(runId) =>
          void navigate({ search: runId ? { run: runId } : {}, replace: false })
        }
      />
      <details className="rounded-md border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Advanced: run tools from any browser MCP connection
        </summary>
        <CloudWorkspacePage kind="browser" />
      </details>
    </div>
  );
}
