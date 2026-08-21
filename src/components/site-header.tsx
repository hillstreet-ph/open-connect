import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandLogoMenu, UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const marketingNav = [
  { to: "/resources" as const, label: "Resources" },
  { to: "/connections" as const, label: "Connections" },
  { to: "/models" as const, label: "Models" },
];

const appNav = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/api-keys" as const, label: "API Keys" },
  { to: "/resources" as const, label: "Resources" },
  { to: "/connections" as const, label: "Connections" },
  { to: "/models" as const, label: "Models" },
  { to: "/settings" as const, label: "Settings" },
];

const APP_PREFIXES = ["/dashboard", "/settings", "/api-keys", "/agents", "/toolkits"];

function useAppShell() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onAppRoute = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAppShell = Boolean(user) && onAppRoute;
  return { user, loading, isAppShell, pathname };
}

export function SiteHeader() {
  const { user, loading, isAppShell } = useAppShell();
  const [open, setOpen] = useState(false);
  const nav = isAppShell ? appNav : marketingNav;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl",
        isAppShell
          ? "border-border/80 bg-background/95"
          : "border-border/70 bg-background/85",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <BrandLogoMenu />

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {loading ? null : isAppShell ? (
            <UserMenu />
          ) : user ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <UserMenu />
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          {!loading && user ? <UserMenu /> : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle navigation"
            onClick={() => setOpen((value) => !value)}
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </div>

      <div className={cn("border-t border-border/70 md:hidden", open ? "block" : "hidden")}>
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
          {!user ? (
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm font-medium text-primary"
            >
              Sign in
            </Link>
          ) : !isAppShell ? (
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2 text-sm font-medium text-primary"
            >
              Open dashboard
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
