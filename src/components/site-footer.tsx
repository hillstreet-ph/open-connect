import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function SiteFooter() {
  const { user } = useAuth();

  return (
    <footer className="border-t border-border/70 bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-sm font-semibold">Open-Connect</p>
          <p className="mt-2 text-sm text-muted-foreground">
            One account, one key, one gateway for agent resources, app connections and AI models.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Platform</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/resources" className="hover:text-foreground">
                Agent resources
              </Link>
            </li>
            <li>
              <Link to="/connections" className="hover:text-foreground">
                Connect apps
              </Link>
            </li>
            <li>
              <Link to="/models" className="hover:text-foreground">
                AI models
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium">Interfaces</p>
          <ul className="mt-3 space-y-2 font-mono text-xs text-muted-foreground">
            <li>/mcp</li>
            <li>/api/v1</li>
            <li>/oauth</li>
            <li>/v1</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium">Account</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {user ? (
              <>
                <li>
                  <Link to="/dashboard" className="hover:text-foreground">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/settings" className="hover:text-foreground">
                    Settings
                  </Link>
                </li>
              </>
            ) : (
              <li>
                <Link to="/auth" className="hover:text-foreground">
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Open-Connect · open-connect.site · Owned & operated independently
      </div>
    </footer>
  );
}
