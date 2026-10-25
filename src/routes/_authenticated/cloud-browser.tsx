import { CloudBrowserSwitcher } from "@/components/cloud-browser-switcher";
import { browserProvider, type BrowserProviderId } from "@/lib/browser-provider-selection";
import { createFileRoute } from "@tanstack/react-router";
import { CloudBrowserConsole } from "@/components/cloud-browser-console";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { run?: string; mode?: "direct"; provider?: BrowserProviderId } => {
    const run = typeof search["run"] === "string" ? search["run"].trim() : "";
    return {
      provider: browserProvider(search["provider"]),
      ...(/^[A-Za-z0-9_-]{1,128}$/.test(run) ? { run } : {}),
      ...(search["mode"] === "direct" ? { mode: "direct" as const } : {}),
    };
  },
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudBrowserRoute,
});

function CloudBrowserRoute() {
  const { run, mode, provider: selection } = Route.useSearch();
  const provider = selection ?? "tinyfish";
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
      <CloudBrowserSwitcher
        selected={provider}
        onSelect={(next) =>
          void navigate({
            search: { provider: next, ...(run ? { run } : {}), ...(mode ? { mode } : {}) },
          })
        }
        tinyfish={
          <CloudBrowserConsole
            initialMode={mode}
            {...(run ? { runId: run } : {})}
            onSelectRun={(runId) =>
              void navigate({
                search: (previous) => ({
                  provider: browserProvider(previous.provider),
                  ...(runId ? { run: runId } : {}),
                  ...(previous.mode ? { mode: previous.mode } : {}),
                }),
                replace: false,
              })
            }
          />
        }
        external={<CloudWorkspacePage kind="browser" embedded />}
      />
    </div>
  );
}
