import { createFileRoute } from "@tanstack/react-router";
import { MemoryKnowledgePage } from "./memory";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Project Knowledge — Open-Connect" },
      {
        name: "description",
        content: "Searchable project documents, sources, and reusable knowledge.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  return <MemoryKnowledgePage defaultSection="knowledge" />;
}
