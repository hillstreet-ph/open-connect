import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backFallback } from "@/lib/back-navigation";

/**
 * Renders the same markup on server and client; history is only consulted on
 * click so hydration never diverges.
 */
export function BackButton({ pathname, inApp }: { pathname: string; inApp: boolean }) {
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 gap-1 px-2"
      aria-label="Go back"
      onClick={() => {
        if (canGoBack) router.history.back();
        else void navigate({ to: backFallback(pathname, inApp) });
      }}
    >
      <ArrowLeft className="size-4" aria-hidden />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
}
