import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { managePlatformSandbox } from "@/lib/sandbox.functions";
export function SandboxManager() {
  const { user } = useAuth();
  const call = useServerFn(managePlatformSandbox);
  const inFlight = useRef(false);
  const [approved, setApproved] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const status = useQuery({
    queryKey: ["platform-sandboxes", user?.id],
    enabled: Boolean(user),
    queryFn: () => call({ data: { action: "status" } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const action = useMutation({
    mutationFn: (
      data:
        { action: "create"; spendApproved: true } | { action: "stop"; id: string; confirm: true },
    ) => call({ data }),
    retry: false,
    onSuccess: () => {
      void status.refetch();
      setApproved(false);
      setConfirmStop(false);
    },
  });
  const perform = (data: Parameters<typeof action.mutate>[0]) => {
    if (inFlight.current) return;
    inFlight.current = true;
    action.mutate(data, {
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Managed E2B sandboxes">
      <h2 className="font-semibold">Managed E2B sandboxes</h2>
      <p className="text-sm text-muted-foreground">
        Platform administrators can inspect the deployment account and create a base environment
        with a five-minute lifetime. Other accounts can use their own provider tools below.
      </p>
      {status.isPending ? (
        <p role="status">Checking E2B…</p>
      ) : status.isError ? (
        <p role="alert">{status.error.message}</p>
      ) : !status.data?.configured ? (
        <p>Deployment E2B key is not configured.</p>
      ) : (
        <>
          <p className="text-sm">E2B reachable · showing up to 100 running or paused sandboxes.</p>
          {!status.data.sandboxes.length ? (
            <p className="text-sm">No sandboxes returned.</p>
          ) : (
            <ul className="space-y-2">
              {status.data.sandboxes.map((row, index) => (
                <li
                  key={row.id ?? index}
                  className="flex flex-wrap items-center gap-3 rounded border p-2 text-sm"
                >
                  <span>
                    {row.id ?? "Unknown sandbox"} · {row.state ?? "State unavailable"}
                  </span>
                  {row.id ? (
                    <button
                      type="button"
                      className="underline"
                      disabled={!confirmStop || action.isPending}
                      onClick={() => perform({ action: "stop", id: row.id!, confirm: true })}
                    >
                      Stop sandbox
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
            I approve provider charges for one five-minute sandbox.
          </label>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            disabled={!approved || action.isPending || action.isError}
            onClick={() => perform({ action: "create", spendApproved: true })}
          >
            Create base sandbox
          </button>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmStop}
              onChange={(event) => setConfirmStop(event.target.checked)}
            />
            Confirm stopping the sandbox I select.
          </label>
        </>
      )}
      <button
        type="button"
        className="text-sm underline"
        disabled={action.isPending || status.isFetching}
        onClick={async () => {
          const result = await status.refetch();
          if (!result.isError) action.reset();
        }}
      >
        Refresh / reconcile sandbox list
      </button>
      {action.isError ? (
        <p role="alert" className="text-sm">
          {action.error.message}
        </p>
      ) : null}
      {action.data?.created ? (
        <p role="status" className="text-sm">
          Created {action.data.created.id}. Expires after five minutes unless stopped earlier.
        </p>
      ) : null}
      {action.data?.stopRequested ? (
        <p role="status" className="text-sm">
          Stop request accepted. Refresh the list to inspect current state.
        </p>
      ) : null}
    </section>
  );
}
