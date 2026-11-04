import { createFileRoute } from "@tanstack/react-router";
import { PlaywrightBrowser } from "@/components/playwright-browser";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { run?: string; provider?: string } => ({
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
    ...(typeof search["provider"] === "string" ? { provider: search["provider"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudBrowserPage,
});

function CloudBrowserPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Cloud Browser</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One combined workspace: Playwright browser sessions with saved profiles and AI agents,
          together with provider computer-use desktop tools.
        </p>
      </header>
      <section aria-label="Playwright browser automation" className="space-y-4">
        <h2 className="text-lg font-semibold">Browser · Playwright</h2>
        <PlaywrightBrowser />
      </section>
      <section aria-label="Computer use" className="space-y-4">
        <h2 className="text-lg font-semibold">Computer use</h2>
        <CloudWorkspacePage kind="computer" embedded />
      </section>
    </div>
  );
}

