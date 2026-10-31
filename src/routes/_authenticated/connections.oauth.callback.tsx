import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { completeOAuthConnection } from "@/lib/connections.functions";
import { completeAiProviderSignIn } from "@/lib/ai-provider-signin.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SUBSCRIPTION_PROVIDERS = new Set(["openai", "anthropic"]);

function providerFromState(state: string): string {
  const provider = state.split(":")[0] ?? "";
  return SUBSCRIPTION_PROVIDERS.has(provider) ? provider : "github";
}

export const Route = createFileRoute("/_authenticated/connections/oauth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search["code"] === "string" ? search["code"] : "",
    state: typeof search["state"] === "string" ? search["state"] : "",
    error: typeof search["error"] === "string" ? search["error"] : "",
  }),
  head: () => ({ meta: [{ title: "Authorization — Open-Connect" }] }),
  component: OAuthCallbackPage,
});

function OAuthCallbackPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const complete = useServerFn(completeOAuthConnection);
  const completeAi = useServerFn(completeAiProviderSignIn);
  const started = useRef(false);
  const provider = providerFromState(search.state);
  const mutation = useMutation({
    mutationFn: () =>
      provider === "github"
        ? complete({ data: { provider: "github", code: search.code, state: search.state } })
        : completeAi({ data: { provider, code: search.code, state: search.state } }),
    onSuccess: () => {
      window.setTimeout(() => void navigate({ to: "/connections" }), 900);
    },
  });

  useEffect(() => {
    if (started.current || search.error || !search.code || !search.state) return;
    started.current = true;
    mutation.mutate();
  }, [mutation, search.code, search.error, search.state]);

  const providerLabel =
    provider === "openai" ? "ChatGPT" : provider === "anthropic" ? "Claude" : "GitHub";

  const error =
    search.error ||
    (!search.code || !search.state
      ? "The provider did not return a complete authorization response."
      : "") ||
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
              ? `${providerLabel} authorization failed`
              : mutation.isSuccess
                ? `${providerLabel} connected`
                : `Verifying ${providerLabel} authorization`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {error
              ? error
              : mutation.isSuccess
                ? "The identity was verified and its token was stored securely in Vault."
                : "Open-Connect is exchanging the one-time code and verifying the provider identity."}
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
