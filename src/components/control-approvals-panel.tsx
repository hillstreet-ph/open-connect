import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { useRoles } from "@/hooks/use-roles";
import { listMyControlApprovals, decideMyControlApproval } from "@/lib/control-approvals.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export function ControlApprovalsPanel() {
  const client = useQueryClient();
  const { user } = useAuth();
  const listFn = useServerFn(listMyControlApprovals);
  const decideFn = useServerFn(decideMyControlApproval);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const { isAdmin } = useRoles();
  const [selection, setSelection] = useState<{
    id: string;
    target: string;
    decision: "approved" | "denied";
  } | null>(null);
  const query = useQuery({
    queryKey: ["control-approvals", user?.id],
    enabled: Boolean(user),
    queryFn: () => listFn({}),
    refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "denied" }) =>
      decideFn({ data: { ...input, confirm: true } }),
    onSuccess: () => {
      toast.success("Decision saved. The agent must resume and verify execution.");
      setSelection(null);
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["control-approvals"] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval requests</CardTitle>
        <CardDescription>
          Review your latest 100 requests from connected agents. Approval records permission; it
          does not run or deploy the task.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Refresh requests
        </Button>
        {query.isPending && <p role="status">Loading approval requests…</p>}
        {query.isError && <p role="alert">{query.error.message}</p>}
        {query.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No requests for this account. Sign in with the same account used by your agent.
          </p>
        )}
        {!isAdmin && (
          <p className="text-sm text-muted-foreground">
            You can view your requests. An administrator role is required to decide them.
          </p>
        )}
        {query.data?.map((request) => {
          const expired = request.state === "pending" && Date.parse(request.expires_at) <= now;
          const pending = request.state === "pending" && !expired;
          return (
            <section key={request.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{expired ? "expired" : request.state}</Badge>
                <Badge variant="outline">{request.environment}</Badge>
                <Badge variant="outline">{request.risk}</Badge>
              </div>
              <p className="break-words text-sm">{request.target}</p>
              <dl className="space-y-1 break-all text-xs text-muted-foreground">
                <div>
                  <dt className="inline">Request: </dt>
                  <dd className="inline">{request.id}</dd>
                </div>
                <div>
                  <dt className="inline">Action: </dt>
                  <dd className="inline">{request.action}</dd>
                </div>
                <div>
                  <dt className="inline">Expires: </dt>
                  <dd className="inline">{new Date(request.expires_at).toLocaleString()}</dd>
                </div>
              </dl>
              {expired && (
                <p className="text-sm text-muted-foreground">
                  Ask your agent to prepare a new request. Expired requests cannot be approved.
                </p>
              )}
              {pending && isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => setSelection({ ...request, decision: "approved" })}
                  >
                    Review & approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => setSelection({ ...request, decision: "denied" })}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </section>
          );
        })}
      </CardContent>
      <AlertDialog
        open={selection !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setSelection(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selection?.decision === "approved" ? "Approve this request?" : "Deny this request?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {selection?.target} Your decision applies only to this request. Execution must be
              resumed separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (selection) mutation.mutate(selection);
              }}
            >
              {mutation.isPending ? "Saving…" : "Confirm decision"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
