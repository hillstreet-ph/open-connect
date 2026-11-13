import { createFileRoute, redirect } from "@tanstack/react-router";
import { factorySearch } from "@/lib/ai-factory-navigation";

/**
 * `/ai-factory` is no longer a page of its own.
 *
 * The SPA that used to live here had its own shell, its own view switch and its
 * own copy of the roster — a second platform beside the merged one at
 * `/ai-factory/roster/`. Its two unique views (the Workforce Directory and the
 * private Team Builder) are now sections of that one platform, so this route
 * only forwards old bookmarks to the section that holds what they asked for.
 *
 * The mapping is the same one the worker applies in `legacyFactoryRedirect`, so
 * a client-side navigation and a cold request land in the same place.
 */
const VIEW_TARGETS: Record<string, string> = {
  teams: "/ai-factory/roster/team-builder",
  roster: "/ai-factory/roster/",
  workforce: "/ai-factory/roster/workforce",
  agents: "/ai-factory/roster/workforce",
  directory: "/ai-factory/roster/workforce",
  "team-builder": "/ai-factory/roster/team-builder",
  builder: "/ai-factory/roster/team-builder",
  niches: "/ai-factory/roster/niches",
  playbooks: "/ai-factory/roster/playbooks",
  hub: "/ai-factory/roster/hub",
  "command-center": "/ai-factory/roster/command-center",
  connectors: "/ai-factory/roster/connectors",
  registry: "/ai-factory/roster/registry",
  studio: "/ai-factory/roster/studio",
  overview: "/ai-factory/roster/",
  index: "/ai-factory/roster/",
};

export const Route = createFileRoute("/_authenticated/ai-factory")({
  validateSearch: factorySearch,
  beforeLoad: ({ search }) => {
    // A specialist selection belongs to the Workforce view, whatever `view` says.
    const target =
      search.agent || search.chat
        ? "/ai-factory/roster/workforce"
        : (VIEW_TARGETS[search.view ?? ""] ?? "/ai-factory/roster/");
    const params = new URLSearchParams();
    if (search.agent) params.set("agent", search.agent);
    if (search.chat) params.set("chat", search.chat);
    const query = params.toString();
    // A full document load, not a router navigation: the target is a static
    // page outside the SPA, so the router cannot render it.
    if (typeof window !== "undefined") {
      window.location.replace(query ? `${target}?${query}` : target);
      return;
    }
    throw redirect({ href: query ? `${target}?${query}` : target, replace: true });
  },
});
