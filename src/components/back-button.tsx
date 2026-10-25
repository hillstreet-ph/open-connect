import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Return to the parent surface, independent of tab/hash and external history. */
export function BackButton({
  fallback = "/dashboard",
  fallbackHash,
}: {
  fallbackHash?: string | undefined;
  fallback?: "/dashboard" | "/" | "/settings" | "/projects" | "/admin";
}) {
  const router = useRouter();
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
        void router.navigate({ to: fallback, hash: fallbackHash ?? "" });
      }}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
}
