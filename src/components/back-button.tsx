import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BackTarget } from "@/lib/back-navigation";
/** Parent navigation never depends on external browser history or OAuth redirects. */
export function BackButton({ target }: { target: BackTarget | null }) {
  const router = useRouter();
  if (!target) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={target.label}
      title={target.label}
      className="shrink-0 gap-2 px-2 sm:px-3"
      onClick={() => {
        if (target.to === "/projects/$projectId")
          void router.navigate({ to: target.to, params: target.params, search: {}, hash: "" });
        else void router.navigate({ to: target.to, search: {}, hash: target.hash || "" });
      }}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
}
