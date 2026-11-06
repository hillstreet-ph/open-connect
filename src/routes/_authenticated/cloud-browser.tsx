import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CloudBrowserConsole } from "@/components/cloud-browser-console";
import { CloudBrowserSearch } from "@/components/cloud-browser-search";

/**
 * One cloud browser for general use, powered by TinyFish: prompt tasks with live
 * view, saved sign-in profiles, direct control, and run history. Desktop
 * computer use lives on /cloud-computer. `provider` is still accepted so links
 * from the earlier multi-provider page keep working; it no longer switches
 * providers.
 */
export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { run?: string; mode?: "direct"; provider?: string } => ({
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
    ...(search["mode"] === "direct" ? { mode: "direct" as const } : {}),
    ...(typeof search["provider"] === "string" ? { provider: search["provider"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudBrowserPage,
});

function CloudBrowserPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/cloud-browser" });
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Cloud Browser</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A real cloud Chrome powered by TinyFish. Describe a task and watch it live, take direct
          control, and reuse saved sign-ins. The same browser is available to Claude and ChatGPT
          through open-connect.site/mcp.
        </p>
      </header>
      <CloudBrowserConsole
        {...(search.run ? { runId: search.run } : {})}
        initialMode={search.mode}
        onSelectRun={(run) =>
          void navigate({
            search: ({ run: _previous, ...rest }) => (run ? { ...rest, run } : rest),
            replace: true,
          })
        }
      />
      <CloudBrowserSearch />
      <p className="text-sm text-muted-foreground">
        Need a full desktop instead of a browser?{" "}
        <Link to="/cloud-computer" className="underline">
          Open Cloud Computer
        </Link>
        .
      </p>
    </div>
  );
}
