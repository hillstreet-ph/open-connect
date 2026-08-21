import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, KeyRound, LayoutDashboard, LogOut, Plug, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string, email: string) {
  const base = (name || email || "U").trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function useProfile() {
  const { user, loading } = useAuth();
  const profileQuery = useQuery({
    queryKey: ["header-profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const displayName =
    profileQuery.data?.display_name ||
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Account";
  const email = user?.email ?? "";
  const avatarUrl =
    profileQuery.data?.avatar_url ??
    (user?.user_metadata?.avatar_url as string | undefined) ??
    "";

  return { user, loading, displayName, email, avatarUrl };
}

/** End session and land on /login (redirects to sign-in UI). */
async function performSignOut(navigate: ReturnType<typeof useNavigate>) {
  await supabase.auth.signOut();
  toast.success("Signed out");
  await navigate({ to: "/login" });
}

/** Exactly four actions: Dashboard · API Keys · Settings · Sign out */
function AccountMenuItems({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <DropdownMenuItem asChild>
        <Link to="/dashboard" className="cursor-pointer">
          <LayoutDashboard className="mr-2 size-4" />
          Dashboard
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/api-keys" className="cursor-pointer">
          <KeyRound className="mr-2 size-4" />
          API Keys
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/settings" className="cursor-pointer">
          <Settings className="mr-2 size-4" />
          Settings
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="cursor-pointer text-destructive focus:text-destructive"
        onSelect={(e) => {
          e.preventDefault();
          onSignOut();
        }}
      >
        <LogOut className="mr-2 size-4" />
        Sign out
      </DropdownMenuItem>
    </>
  );
}

function AccountHeader({ displayName, email, avatarUrl }: { displayName: string; email: string; avatarUrl: string }) {
  return (
    <DropdownMenuLabel className="font-normal">
      <div className="flex items-center gap-3">
        <Avatar className="size-9 border border-border/70">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
            {initials(displayName, email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium leading-none">{displayName}</span>
          <span className="truncate text-xs leading-none text-muted-foreground">{email}</span>
        </div>
      </div>
    </DropdownMenuLabel>
  );
}

/** Logo: home when signed out; same 4-item menu when signed in. */
export function BrandLogoMenu() {
  const { user, loading, displayName, email, avatarUrl } = useProfile();
  const navigate = useNavigate();

  const mark = (
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-glow">
      <Plug className="size-4" />
    </span>
  );

  if (loading || !user) {
    return (
      <Link to="/" className="flex items-center gap-2" aria-label="Open-Connect home">
        {mark}
        <span className="font-display text-base font-semibold tracking-tight">Open-Connect</span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          {mark}
          <span className="font-display text-base font-semibold tracking-tight">Open-Connect</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <AccountHeader displayName={displayName} email={email} avatarUrl={avatarUrl} />
        <DropdownMenuSeparator />
        <AccountMenuItems onSignOut={() => void performSignOut(navigate)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Top-right [ MK ▾ ] avatar menu */
export function UserMenu() {
  const { user, loading, displayName, email, avatarUrl } = useProfile();
  const navigate = useNavigate();

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/login" search={{ mode: "signup" }}>
            Get started
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 gap-1.5 rounded-full px-1.5 pr-2"
          aria-label="Account menu"
        >
          <Avatar className="size-8 border border-border/70">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials(displayName, email)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <AccountHeader displayName={displayName} email={email} avatarUrl={avatarUrl} />
        <DropdownMenuSeparator />
        <AccountMenuItems onSignOut={() => void performSignOut(navigate)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProfileAvatarBadge({
  name,
  email,
  avatarUrl,
}: {
  name?: string;
  email?: string;
  avatarUrl?: string | null;
}) {
  const label = name || email || "U";
  return (
    <Avatar className="size-10 border border-border/70">
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={label} /> : null}
      <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
        {initials(name || "", email || "")}
      </AvatarFallback>
    </Avatar>
  );
}
