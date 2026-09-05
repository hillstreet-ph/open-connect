import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysCard } from "@/components/api-keys-card";

export const Route = createFileRoute("/_authenticated/api-keys")({
  head: () => ({
    meta: [
      { title: "API Keys — Open-Connect" },
      {
        name: "description",
        content: "Create and manage scoped oc_live_ API keys for agents and clients.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApiKeysPage,
});

function ApiKeysPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="text-3xl font-semibold">API Keys</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create multiple scoped keys for agents, ChatGPT plugins, Claude, Hermes, and custom clients.
        Authenticate against <code className="font-mono text-primary">/mcp</code> and{" "}
        <code className="font-mono text-primary">/v1</code>.
      </p>
      <div className="mt-8">
        <ApiKeysCard />
      </div>
    </div>
  );
}
