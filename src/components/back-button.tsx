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
  // Home surfaces never need a back control, even after internal navigation.
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/dashboard") return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Go back"
      title="Go back"
      className="shrink-0 gap-2 px-2 sm:px-3"
      onClick={() => {
        if (canGoBack) router.history.back();
        else void router.navigate({ to: fallback });
      }}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
}
