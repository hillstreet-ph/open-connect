import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandLogo, UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/use-auth";
import { isAppPath } from "@/lib/shell";
import { cn } from "@/lib/utils";

const publicNav = [
  { to: "/resources" as const, label: "Marketplace" },
  { to: "/connections" as const, label: "Connections" },
  { to: "/models" as const, label: "Models" },
  { to: "/integrations" as const, label: "Integrations" },
];

const appNav = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/agents" as const, label: "Agents" },
  { to: "/toolkits" as const, label: "Toolkits" },
  { to: "/resources" as const, label: "Marketplace" },
  { to: "/connections" as const, label: "Connections" },
  { to: "/models" as const, label: "Models" },
  { to: "/secrets" as const, label: "Secrets" },
  { to: "/integrations" as const, label: "Integrations" },
];

export function SiteHeader() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inApp = Boolean(user) && isAppPath(pathname);
  const [open, setOpen] = useState(false);
  const nav = inApp ? appNav : publicNav;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl",
        inApp ? "border-border bg-background/98" : "border-border/70 bg-background/85",
      )}
    >
      {inApp ? (
        <div className="border-b border-primary/20 bg-primary/5 px-4 py-1 text-center text-[11px] font-medium tracking-wide text-primary">
          App workspace · signed in
        </div>
      ) : null}

      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <BrandLogo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label={inApp ? "App" : "Site"}>
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {loading ? null : inApp ? (
            <UserMenu />
          ) : user ? (
            <>
              <Button asChild size="sm">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <UserMenu />
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          {!loading ? <UserMenu /> : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
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
          ) : !inApp ? (
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
