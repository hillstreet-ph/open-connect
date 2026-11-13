import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { finishCustomOAuth } from "@/lib/custom-oauth.functions";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/custom-oauth-callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: String(search["code"] || ""),
    state: String(search["state"] || ""),
    error: String(search["error"] || ""),
  }),
  component: Callback,
});
function Callback() {
  const search = Route.useSearch();
  const finish = useServerFn(finishCustomOAuth);
  const once = useRef(false);
  const [message, setMessage] = useState(
    search.error
      ? "The provider did not authorize this connection. You can try again."
      : "Completing provider authorization…",
  );
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (search.error) return;
    void finish({ data: { code: search.code, state: search.state } })
      .then((result) => {
        history.replaceState(null, "", "/custom-oauth-callback");
        setMessage(
          result.discovery_ready
            ? "Authorization and capability discovery completed. Your connection is ready."
            : "Authorization completed. Return to Connectors and retry capability discovery before using tools.",
        );
      })
      .catch(() =>
        setMessage(
          "Authorization could not be completed. The request may have expired; start a new connection.",
        ),
      );
  }, [search, finish]);
  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Custom connector authorization</h1>
      <p role="status">{message}</p>
      <Button asChild>
        <Link to="/connections">Return to Connectors</Link>
      </Button>
    </div>
  );
}
