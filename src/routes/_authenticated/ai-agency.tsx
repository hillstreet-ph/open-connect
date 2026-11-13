import { createFileRoute, redirect } from "@tanstack/react-router";
import { factorySearch } from "@/lib/ai-factory-navigation";

// Keep existing bookmarks working; AI Factory owns the workspace and all new navigation.
export const Route = createFileRoute("/_authenticated/ai-agency")({
  validateSearch: factorySearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/ai-factory", search, replace: true });
  },
});
