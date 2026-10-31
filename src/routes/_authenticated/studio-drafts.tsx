import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { DataControlsPanel } from "@/components/data-controls-panel";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/studio-drafts")({
  head: () => ({
    meta: [
      { title: "Reusable drafts — Open-Connect" },
      {
        name: "description",
        content:
          "Create reusable prompts, skills, guides, and Toolkit drafts from your own workflow.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioDraftsPage,
});

function StudioDraftsPage() {
  const { primary } = useRoles();
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/40 text-primary">
            Workspace · Studio
          </Badge>
          <Badge variant="secondary" className="uppercase">
            {roleLabel(primary)}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Reusable Studio drafts
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Create prompts, skills, guides, or Toolkit blueprints from your
              own workflow. Drafts stay private until you build them for review
              and publish from Studio.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/studio">
              <ArrowLeft className="size-3.5" />
              Back to Studio
            </Link>
          </Button>
        </div>
      </header>
      <DataControlsPanel studio />
    </div>
  );
}
