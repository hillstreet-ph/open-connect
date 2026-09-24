import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { completeOAuthConnection } from "@/lib/connections.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/connections/oauth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
    state: typeof search.state === "string" ? search.state : "",
    error: typeof search.error === "string" ? search.error : "",
  }),
  head: () => ({ meta: [{ title: "GitHub authorization — Open-Connect" }] }),
  component: OAuthCallbackPage,
});

function OAuthCallbackPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const complete = useServerFn(completeOAuthConnection);
  const started = useRef(false);
  const mutation = useMutation({
    mutationFn: () =>
      complete({ data: { provider: "github", code: search.code, state: search.state } }),
    onSuccess: () => {
      window.setTimeout(() => void navigate({ to: "/connections" }), 900);
    },
  });

  useEffect(() => {
    if (started.current || search.error || !search.code || !search.state) return;
    started.current = true;
    mutation.mutate();
  }, [mutation, search.code, search.error, search.state]);

  const error =
    search.error ||
    (!search.code || !search.state ? "GitHub did not return a complete authorization response." : "") ||
    (mutation.error instanceof Error ? mutation.error.message : "");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4">
      <Card className="w-full bg-pillar shadow-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {error ? (
              <XCircle className="size-5 text-destructive" />
            ) : mutation.isSuccess ? (
              <CheckCircle2 className="size-5 text-primary" />
            ) : (
              <Loader2 className="size-5 animate-spin text-primary" />
            )}
            {error
              ? "GitHub authorization failed"
              : mutation.isSuccess
                ? "GitHub connected"
                : "Verifying GitHub authorization"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {error
              ? error
              : mutation.isSuccess
                ? "The GitHub identity was verified and its token was stored securely in Vault."
                : "Open-Connect is exchanging the one-time code and verifying your GitHub identity."}
          </p>
          {error ? (
            <Button asChild>
              <Link to="/connections">Return to Connectors</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
