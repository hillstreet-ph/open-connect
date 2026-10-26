import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Check, Copy, Loader2, UsersRound } from "lucide-react";
import { AGENCY_TEAMS, agencyTranscript, type AgencyResult } from "@/lib/ai-agency";
import { runAiAgency } from "@/lib/ai-agency.functions";
import { saveAgentChat } from "@/lib/agent-chat.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/ai-agency")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: AGENCY_TEAMS.find((team) => team.id === search["category"])?.id ?? "development",
  }),
  head: () => ({
    meta: [{ title: "AI Agency — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: AiAgencyPage,
});

function AiAgencyPage() {
  const { category } = Route.useSearch();
  const navigate = Route.useNavigate();
  const selected = AGENCY_TEAMS.find((team) => team.id === category)!;
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<AgencyResult | null>(null);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const runId = useRef("");
  const queryClient = useQueryClient();
  const run = useServerFn(runAiAgency);
  const save = useServerFn(saveAgentChat);
  const saveResult = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!result || !runId.current) throw new Error("Run a team first.");
      return save({
        data: {
          id: runId.current,
          revision: null,
          title: `AI Agency · ${result.team_name} · ${result.goal}`.slice(0, 120),
          mode: "workspace",
          browser_run_id: null,
          messages: [
            { role: "user", content: result.goal },
            ...result.workers.map((worker) => ({
              role: "assistant" as const,
              content: `${worker.role} · ${worker.status}\n${worker.content}\n\nProposal only; external actions have not been executed.`,
            })),
          ],
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent-chat-history"] });
      setSaved(true);
      setNotice("Saved to your private chat history.");
    },
  });
  const execute = useMutation({
    retry: false,
    mutationFn: () => run({ data: { category, goal, context } }),
    onSuccess: (data) => {
      setResult(data);
      runId.current = crypto.randomUUID();
      setSaved(false);
      setNotice("");
      saveResult.reset();
    },
  });
  const busy = execute.isPending || saveResult.isPending;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Connections / AI Agency
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <UsersRound className="size-7" />
            AI Agency
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Specialist teams for your work. Give one brief to three agents and compare their
            recommendations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/models">
              AI Gateway <ArrowUpRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/connections">Connectors</Link>
          </Button>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside aria-label="Team categories" className="space-y-2">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Choose your team
          </h2>
          {AGENCY_TEAMS.map((team) => (
            <button
              key={team.id}
              type="button"
              aria-pressed={team.id === category}
              disabled={busy}
              onClick={() => void navigate({ search: { category: team.id } })}
              className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${team.id === category ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}
            >
              <span className="block text-sm font-semibold">{team.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{team.description}</span>
            </button>
          ))}
        </aside>
        <div className="space-y-6">
          <section
            className="rounded-xl border bg-card p-5 sm:p-6"
            aria-labelledby="agency-brief-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="agency-brief-title" className="text-xl font-semibold">
                  {selected.name} team
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{selected.roles.join(" · ")}</p>
              </div>
              <span className="shrink-0 rounded-full border px-2 py-1 text-xs">3 agents</span>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                execute.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="agency-goal">What should the team work on?</Label>
                <Textarea
                  id="agency-goal"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  maxLength={4000}
                  disabled={busy}
                  rows={3}
                  placeholder="Describe the outcome, constraints and what success looks like."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-context">
                  Reference context <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="agency-context"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  maxLength={24000}
                  disabled={busy}
                  rows={4}
                  placeholder="Add confirmed facts, relevant excerpts and open questions. Keep credentials out of the brief."
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-xs text-muted-foreground">
                  Uses connected, catalog-verified free models. Workers produce proposals; external
                  actions require the appropriate connected tools.
                </p>
                <Button type="submit" disabled={busy || !goal.trim()}>
                  {execute.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UsersRound className="size-4" />
                  )}
                  {execute.isPending ? "Team is working…" : "Run team"}
                </Button>
              </div>
            </form>
            {execute.isError ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {execute.error.message}
              </p>
            ) : null}
          </section>
          {result ? (
            <section aria-labelledby="agency-results-title" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="agency-results-title" className="text-xl font-semibold">
                    {result.team_name} outputs
                  </h2>
                  <p className="mt-1 max-w-xl break-words text-sm text-muted-foreground">
                    {result.goal}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {result.workers.filter((worker) => worker.status === "completed").length} of 3
                    workers completed · No external actions executed
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(agencyTranscript(result));
                        setNotice("Team outputs copied.");
                      } catch {
                        setNotice("Copy is unavailable. Select and copy the outputs below.");
                      }
                    }}
                  >
                    <Copy className="size-4" />
                    Copy outputs
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || saved}
                    onClick={() => saveResult.mutate()}
                  >
                    {saved ? <Check className="size-4" /> : null}
                    {saved ? "Saved" : "Save to history"}
                  </Button>
                </div>
              </div>
              {result.workers.map((worker, index) => (
                <article key={worker.role} className="rounded-xl border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">
                      <span className="mr-3 text-xs tabular-nums text-muted-foreground">
                        0{index + 1}
                      </span>
                      {worker.role}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {worker.status === "completed"
                        ? `${worker.provider} · ${worker.model}`
                        : "Unavailable"}
                    </span>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {worker.content}
                  </p>
                </article>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
                <p className="text-sm text-muted-foreground">
                  Review the outputs, then continue with your connected browser agent.
                </p>
                <Button variant="outline" asChild>
                  <Link to="/cloud-browser">
                    Open Cloud Browser <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </section>
          ) : null}
          {saveResult.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not confirm the save: {saveResult.error.message} Check your chat history before
              retrying.
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
