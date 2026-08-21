import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandLogo, UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/use-auth";
import { appCategories, flatAppNav, flatPublicNav, publicCategories } from "@/lib/nav";
import { isAppPath } from "@/lib/shell";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inApp = Boolean(user) && isAppPath(pathname);
  const [open, setOpen] = useState(false);
  const desktopNav = inApp ? flatAppNav() : flatPublicNav();
  const mobileCategories = inApp ? appCategories : publicCategories;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl",
        inApp ? "border-border bg-background/98" : "border-border/70 bg-background/85",
      )}
    >
      {inApp ? (
        <div className="border-b border-primary/20 bg-primary/5 px-4 py-1 text-center text-[11px] font-medium tracking-wide text-primary">
          Workspace
        </div>
      ) : null}

      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16">
        <BrandLogo />

        <nav
          className="hidden items-center gap-0.5 md:flex"
          aria-label={inApp ? "Workspace" : "Site"}
        >
          {desktopNav.map((item) => (
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

        <div className="flex items-center gap-1">
          {loading ? null : inApp ? (
            <UserMenu />
          ) : user ? (
            <>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <UserMenu />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile: categorized drawer */}
      <div
        className={cn(
          "border-t border-border/70 md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav className="mx-auto max-h-[min(70vh,28rem)] max-w-6xl overflow-y-auto px-4 py-3">
          {mobileCategories.map((cat) => (
            <div key={cat.id} className="mb-4">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </p>
              <ul className="space-y-0.5">
                {cat.items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-2.5 hover:bg-muted/60"
                      activeProps={{ className: "bg-primary/10 text-primary" }}
                    >
                      <span className="block text-sm font-medium">{item.label}</span>
                      {item.description ? (
                        <span className="block text-xs text-muted-foreground">{item.description}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!user ? (
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground"
            >
              Sign in
            </Link>
          ) : !inApp ? (
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground"
            >
              Open dashboard
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
