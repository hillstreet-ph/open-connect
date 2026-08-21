import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LayoutDashboard, LogOut, Settings, User } from "lucide-react";
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

export function UserMenu() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
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

  const displayName =
    profile?.['display_name'] ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Account";
  const email = user.email ?? "";
  const avatarUrl = profile?.['avatar_url'] ?? (user.user_metadata?.avatar_url as string | undefined) ?? "";

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    await navigate({ to: "/" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 gap-2 rounded-full px-1.5 pr-2"
          aria-label="Account menu"
        >
          <Avatar className="size-8 border border-border/70">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials(displayName, email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[7rem] truncate text-sm font-medium sm:inline">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-none">{displayName}</span>
            <span className="text-xs leading-none text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard" className="cursor-pointer">
            <LayoutDashboard className="mr-2 size-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <Settings className="mr-2 size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/agents" className="cursor-pointer">
            <KeyRound className="mr-2 size-4" />
            API & agents
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={(e) => {
            e.preventDefault();
            void signOut();
          }}
        >
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact avatar-only control for tight layouts */
export function UserMenuIcon() {
  return <UserMenu />;
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
      {!avatarUrl && !name && !email ? <User className="size-4" /> : null}
    </Avatar>
  );
}
