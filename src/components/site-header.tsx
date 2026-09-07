import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
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

  // Close drawer on route change / resize to desktop
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl",
        inApp ? "border-border/80 bg-background/95" : "border-border/60 bg-background/80",
      )}
    >
      {inApp ? (
        <div className="border-b border-primary/15 bg-primary/5 px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-primary">
          Workspace
        </div>
      ) : null}

      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-[3.75rem] sm:px-6">
        <BrandLogo />

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label={inApp ? "Workspace" : "Site"}
        >
          {desktopNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium bg-muted/50" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
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
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Get started
                </Link>
              </Button>
              <UserMenu />
            </>
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

      {/* Mobile full-height sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 top-14 z-40 border-t border-border/70 bg-background md:hidden",
          inApp && "top-[4.25rem]",
          open ? "block" : "hidden",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <nav className="mx-auto flex h-full max-w-lg flex-col overflow-y-auto px-4 pb-safe pt-4">
          {mobileCategories.map((cat) => (
            <div key={cat.id} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {cat.label}
              </p>
              <ul className="space-y-1">
                {cat.items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl px-3 py-3 transition-colors hover:bg-muted/70"
                      activeProps={{ className: "bg-primary/10 text-primary" }}
                    >
                      <span className="block text-[15px] font-medium leading-tight">{item.label}</span>
                      {item.description ? (
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                          {item.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-auto space-y-2 border-t border-border/60 pt-4 pb-6">
            {!user ? (
              <>
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  onClick={() => setOpen(false)}
                  className="block rounded-full bg-primary px-4 py-3.5 text-center text-sm font-medium text-primary-foreground shadow-glow"
                >
                  Get started
                </Link>
                <Link
                  to="/auth"
                  onClick={() => setOpen(false)}
                  className="block rounded-full border border-border bg-card px-4 py-3.5 text-center text-sm font-medium"
                >
                  Sign in
                </Link>
              </>
            ) : !inApp ? (
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="block rounded-full bg-primary px-4 py-3.5 text-center text-sm font-medium text-primary-foreground shadow-glow"
              >
                Open dashboard
              </Link>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
