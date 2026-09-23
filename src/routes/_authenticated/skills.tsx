import { createFileRoute } from "@tanstack/react-router";
import { ResourceLibraryPage } from "@/components/resource-library-page";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () => ({
    meta: [
      { title: "Skills — Open-Connect" },
      { name: "description", content: "Your uploaded and Marketplace-added skills." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SkillsPage,
});

function SkillsPage() {
  return (
    <ResourceLibraryPage
      resourceType="skill"
      title="Skills"
      description="All skills you uploaded in Studio or added from Marketplace. Share each skill with one or more projects here."
    />
  );
}
