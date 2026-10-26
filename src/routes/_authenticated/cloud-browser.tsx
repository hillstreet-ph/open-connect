import { createFileRoute } from "@tanstack/react-router";
import { PlaywrightBrowser } from "@/components/playwright-browser";
export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { run?: string; mode?: "direct"; provider?: string } => ({
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Cloud Browser</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse, click, fill forms and inspect pages with Playwright.
        </p>
      </header>
      <PlaywrightBrowser />
    </div>
  ),
});
