import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Approval = {
  id: string;
  action: string;
  target: string;
  environment: string;
  state: string;
  expires_at: string;
  decided_at: string | null;
};

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [{ title: "Approvals — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const approvals = useQuery({
    queryKey: ["control-approvals", user?.id],
    enabled: Boolean(user?.id),
    refetchInterval: 30000,
    queryFn: async (): Promise<Approval[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("control_approvals")
        .select("id,action,target,environment,state,expires_at,decided_at")
        .eq("tenant_id", user.id)
        .eq("requested_by", user.id)
        .order("expires_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = approvals.data ?? [];
  const pending = rows.filter((a) => a.state === "pending" && Date.parse(a.expires_at) > now);
  const history = rows.filter((a) => a.state !== "pending" || Date.parse(a.expires_at) <= now);
  const renderRow = (a: Approval) => {
    const expired = a.state === "pending" && Date.parse(a.expires_at) <= now;
    return (
      <article key={a.id} className="rounded-lg border p-4 space-y-2 break-words">
        <div className="flex flex-wrap justify-between gap-2">
          <strong className="text-sm">{a.action.replaceAll("_", " ")}</strong>
          <span className="text-xs font-medium">{expired ? "Expired" : a.state}</span>
        </div>
        <p className="text-sm">{a.target}</p>
        <p className="text-xs text-muted-foreground">
          {a.environment} · Expires {new Date(a.expires_at).toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">Request: {a.id}</p>
        {a.state === "pending" && !expired ? (
          <p className="text-xs text-muted-foreground">
            Decision controls require the authenticated, policy-checked approval endpoint. This page
            does not automatically authorize or execute protected operations.
          </p>
        ) : null}
      </article>
    );
  };
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Your production and development control requests. Pending requests are shown separately
          from expired and decided requests. This view never executes protected operations.
        </p>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm"
          onClick={() => {
            setNow(Date.now());
            void approvals.refetch();
          }}
        >
          Refresh approvals
        </button>
      </header>
      {approvals.isLoading ? <p role="status">Loading approvals…</p> : null}
      {approvals.error ? (
        <p role="alert" className="text-destructive">
          Could not load approvals:{" "}
          {approvals.error instanceof Error ? approvals.error.message : "Unknown error"}
        </p>
      ) : null}
      {!approvals.isLoading && !approvals.error ? (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Pending ({pending.length})</h2>
            {pending.length ? (
              pending.map(renderRow)
            ) : (
              <p className="text-sm text-muted-foreground">No active pending approvals.</p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">History ({history.length})</h2>
            {history.length ? (
              history.map(renderRow)
            ) : (
              <p className="text-sm text-muted-foreground">No previous requests.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
