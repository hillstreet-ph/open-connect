import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarBadge } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Open-Connect" },
      { name: "description", content: "Manage your Open-Connect profile and account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["settings-profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      return {
        userId: user.id,
        email: user.email ?? "",
        displayName:
          profile?.['display_name'] ||
          (user.user_metadata?.display_name as string | undefined) ||
          "",
        avatarUrl: profile?.['avatar_url'] || (user.user_metadata?.avatar_url as string | undefined) || "",
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.displayName);
    setAvatarUrl(data.avatarUrl);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data?.userId) throw new Error("Not signed in");
      const payload = {
        id: data.userId,
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim() || undefined,
          avatar_url: avatarUrl.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["header-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["profile-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    await navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Profile, avatar and account controls.</p>

      <Card className="mt-8 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Shown in the header menu and on your dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading || !data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-4">
                <ProfileAvatarBadge name={displayName} email={data.email} avatarUrl={avatarUrl} />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{displayName || "Your name"}</p>
                  <p className="truncate text-muted-foreground">{data.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar-url">Avatar image URL</Label>
                <Input
                  id="avatar-url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                />
                <p className="text-xs text-muted-foreground">
                  Paste a public image URL. Leave blank to use initials.
                </p>
              </div>

              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Save profile
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Sign out of Open-Connect on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="mr-2 size-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
