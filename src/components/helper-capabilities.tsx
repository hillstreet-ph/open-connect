import { Link } from "@tanstack/react-router";

const actions = [
  {
    title: "Tasks",
    detail: "List, create, and update status",
    prompt: "List my recent tasks",
    to: "/tasks",
  },
  {
    title: "Memory and knowledge",
    detail: "Search your saved reference context",
    prompt: "Search my saved context for Open-Connect",
    to: "/memory",
  },
  {
    title: "Resources",
    detail: "Search published resources and add to Library",
    prompt: "Find an Airtable skill",
    to: "/library",
  },
  {
    title: "Connectors",
    detail: "List owned connectors and create private Studio drafts",
    prompt: "List my connectors",
    to: "/connections",
  },
  {
    title: "Schedules",
    detail: "Schedule an existing enabled AI response automation",
    prompt: "List my schedules",
    to: "/schedule",
  },
  {
    title: "Automations",
    detail: "List or create manual AI response automations",
    prompt: "List my automations",
    to: "/automations",
  },
] as const;

export function HelperCapabilities({ onPrompt }: { onPrompt: (value: string) => void }) {
  return (
    <section
      aria-label="Helper capabilities"
      className="max-h-72 shrink-0 space-y-3 overflow-y-auto border-b bg-muted/40 p-3 text-xs"
    >
      <div>
        <h3 className="font-semibold">Available workspace actions</h3>
        <p className="mt-1 text-muted-foreground">
          Actions use your signed-in account permissions. Each message can make one change.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <article key={action.title} className="rounded-lg border bg-background p-2">
            <h4 className="font-medium">{action.title}</h4>
            <p className="mt-1 text-muted-foreground">{action.detail}</p>
            <div className="mt-2 flex gap-3">
              <button type="button" className="underline" onClick={() => onPrompt(action.prompt)}>
                Ask helper
              </button>
              <Link to={action.to} className="underline">
                Open page
              </Link>
            </div>
          </article>
        ))}
      </div>
      <p className="text-muted-foreground">
        Use Browser task for website actions. Provider authorization, credentials, roles,
        publication, and cloud setup use their dedicated pages. A listed connector or installed
        resource does not establish working tool execution.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link to="/models" className="underline">
          AI Gateway
        </Link>
        <Link to="/settings" className="underline">
          Data Controls
        </Link>
        <Link to="/studio" className="underline">
          Studio
        </Link>
        <Link to="/cloud-browser" className="underline">
          Cloud browser
        </Link>
      </div>
    </section>
  );
}
