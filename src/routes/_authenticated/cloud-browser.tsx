import { createFileRoute, redirect } from "@tanstack/react-router";
import { PlaywrightBrowser } from "@/components/playwright-browser";

export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { run?: string; mode?: "computer"; provider?: string } => ({
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
    ...(search["mode"] === "computer" ? { mode: "computer" } : {}),
    ...(typeof search["provider"] === "string" ? { provider: search["provider"] } : {}),
  }),
  beforeLoad: ({ search }) => {
    if (search.mode === "computer") throw redirect({ to: "/cloud-computer" });
  },
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
          One professional browser workspace: provider sessions, saved sign-in profiles, live view
          and AI agents that drive the browser for you.
        </p>
      </header>
      <PlaywrightBrowser />
    </div>
  );
}
