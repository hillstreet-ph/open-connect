import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, FileCode, KeyRound, LayoutDashboard, Lock, LogOut, Plug, Settings, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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

async function performSignOut(navigate: ReturnType<typeof useNavigate>) {
  const { error } = await supabase.auth.signOut();
  if (error) {
    toast.error("Could not sign out. Please try again.");
    return;
  }
  toast.success("Signed out");
  await navigate({ to: "/auth" });
}

function AccountMenuItems({
  onSignOut,
  showAdmin,
}: {
  onSignOut: () => void;
  showAdmin: boolean;
}) {
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
      <DropdownMenuItem asChild>
        <Link to="/orgs"><Building2 /> Organizations & workspaces</Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/secrets"><Lock /> Credentials</Link>
      </DropdownMenuItem>
      {showAdmin ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Shield /> System administration</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem asChild>
              <Link to="/admin"><Shield /> User roles</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/roles"><KeyRound /> Access reference</Link>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      <DropdownMenuItem asChild>
        <Link to="/guides"><FileCode /> Help & documentation</Link>
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

export function BrandLogo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Open-Connect home">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-glow">
        <Plug className="size-4" />
      </span>
      <span className="font-display text-base font-semibold tracking-tight">Open-Connect</span>
    </Link>
  );
}

export function BrandLogoMenu() {
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const navigate = useNavigate();
  if (!user) return <BrandLogo />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Open Connect menu"
          className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-glow">
            <Plug className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold group-data-[collapsible=icon]:hidden">Open Connect</span>
          <ChevronDown className="size-4 shrink-0 group-data-[collapsible=icon]:hidden" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Open Connect</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AccountMenuItems showAdmin={isAdmin} onSignOut={() => void performSignOut(navigate)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu() {
  const { user, loading, displayName, email, avatarUrl } = useProfile();
  const { isAdmin, primary } = useRoles();
  const navigate = useNavigate();

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/auth" search={{ mode: "signup" }}>
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
          className="relative h-10 gap-1.5 rounded-full px-1.5 pr-2"
          aria-label="Account menu"
        >
          <Avatar className="size-9 border border-border/70">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials(displayName, email)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
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
              <span className="text-[10px] uppercase tracking-wide text-primary">{roleLabel(primary)}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AccountMenuItems
          showAdmin={isAdmin}
          onSignOut={() => void performSignOut(navigate)}
        />
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
