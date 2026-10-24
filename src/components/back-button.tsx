import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Router-owned history avoids sending a direct-entry visitor back to another site. */
export function BackButton({ fallback = "/dashboard" }: { fallback?: "/dashboard" | "/" }) {
  const router = useRouter();
  const canGoBack = useRouterState({
    select: (state) => (state.location.state.__TSR_index ?? 0) > 0,
  });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Nothing to go back to: a direct visit to the fallback page itself.
  if (!canGoBack && pathname === fallback) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Go back"
      onClick={() => {
        if (canGoBack) router.history.back();
        else void router.navigate({ to: fallback });
      }}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span>Back</span>
    </Button>
  );
}
