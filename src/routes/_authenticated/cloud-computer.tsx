import { createFileRoute } from "@tanstack/react-router";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";
import { CloudComputerManager } from "@/components/cloud-computer-manager";

export const Route = createFileRoute("/_authenticated/cloud-computer")({
  head: () => ({
    meta: [{ title: "Cloud Computer — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudComputerPage,
});

function CloudComputerPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">Cloud Computer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and control always-on cloud desktops, and run computer tools from a connected
          provider in one workspace.
        </p>
      </header>
      <div className="mx-auto max-w-2xl">
        <CloudComputerManager />
      </div>
      <p className="text-sm text-muted-foreground">
        Computer tools use the selected provider connection. Its desktop and files are separate from
        your Playwright browser session.
      </p>
      <CloudWorkspacePage kind="computer" embedded />
    </div>
  );
}
