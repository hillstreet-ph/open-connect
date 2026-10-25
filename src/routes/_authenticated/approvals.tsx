import { createFileRoute } from "@tanstack/react-router";
import { ControlApprovalsPanel } from "@/components/control-approvals-panel";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [{ title: "Approvals — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review your control requests using the same protected controls as Settings. Decisions
          record permission; execution must be resumed and verified separately.
        </p>
      </header>
      <ControlApprovalsPanel />
    </main>
  );
}
