import { createFileRoute, Link } from "@tanstack/react-router";
import { PlaywrightBrowser } from "@/components/playwright-browser";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { run?: string; mode?: "browser" | "computer"; provider?: string } => ({
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
    ...(search["mode"] === "browser" || search["mode"] === "computer"
      ? { mode: search["mode"] }
      : {}),
    ...(typeof search["provider"] === "string" ? { provider: search["provider"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudBrowserPage,
});

function CloudBrowserPage() {
  const { mode } = Route.useSearch();
  const computer = mode === "computer";
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Cloud Browser</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One professional workspace for browser and desktop automation: Playwright sessions with
          saved profiles and AI agents, plus provider computer-use tools.
        </p>
      </header>
      <nav aria-label="Cloud workspace" className="flex flex-wrap gap-2">
        <Link
          to="/cloud-browser"
          search={{}}
          aria-current={!computer ? "page" : undefined}
          className={`rounded-md border px-4 py-2 text-sm ${!computer ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
        >
          Browser · Playwright
        </Link>
        <Link
          to="/cloud-browser"
          search={{ mode: "computer" }}
          aria-current={computer ? "page" : undefined}
          className={`rounded-md border px-4 py-2 text-sm ${computer ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
        >
          Computer use
        </Link>
      </nav>
      <div hidden={computer}>
        <PlaywrightBrowser />
      </div>
      <div hidden={!computer} className="space-y-4">
        {computer && <CloudWorkspacePage kind="computer" embedded />}
      </div>
    </div>
  );
}

