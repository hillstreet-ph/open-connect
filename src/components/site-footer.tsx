import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function SiteFooter() {
  const { user } = useAuth();

  return (
    <footer className="border-t border-border/70 bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="font-display text-sm font-semibold">Open-Connect</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Resources · Connections · Models — one account, one key, one gateway.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Discover
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/resources" className="hover:text-foreground">
                Marketplace
              </Link>
            </li>
            <li>
              <Link to="/connections" className="hover:text-foreground">
                Connections
              </Link>
            </li>
            <li>
              <Link to="/models" className="hover:text-foreground">
                Models
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Connect
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/integrations" className="hover:text-foreground">
                Integrations
              </Link>
            </li>
            <li className="font-mono text-xs">/mcp</li>
            <li className="font-mono text-xs">/v1 · /api/v1 · /oauth</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {user ? (
              <>
                <li>
                  <Link to="/dashboard" className="hover:text-foreground">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/api-keys" className="hover:text-foreground">
                    API Keys
                  </Link>
                </li>
                <li>
                  <Link to="/settings" className="hover:text-foreground">
                    Settings
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to="/auth" className="hover:text-foreground">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link to="/auth" search={{ mode: "signup" }} className="hover:text-foreground">
                    Create account
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Open-Connect · open-connect.site
      </div>
    </footer>
  );
}
