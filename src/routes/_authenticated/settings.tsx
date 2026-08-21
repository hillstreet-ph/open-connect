import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Save, Trash2, Upload } from "lucide-react";
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
      { name: "description", content: "Profile photo, display name, and password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function SettingsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
          profile?.display_name ||
          (user.user_metadata?.display_name as string | undefined) ||
          "",
        avatarUrl:
          profile?.avatar_url || (user.user_metadata?.avatar_url as string | undefined) || "",
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.displayName);
    setAvatarUrl(data.avatarUrl);
  }, [data]);

  async function onPickPhoto(file: File | null) {
    if (!file || !data?.userId) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Use JPEG, PNG, or WebP");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Max photo size is 2 MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${data.userId}/avatar.${ext}`;
      const { error: upError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (upError) throw upError;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      setAvatarUrl(`${pub.publicUrl}?t=${Date.now()}`);
      toast.success("Photo uploaded — click Save changes");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto() {
    setAvatarUrl("");
    toast.message("Photo cleared — click Save changes to apply");
  }

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
          avatar_url: avatarUrl.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Changes saved");
      void queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["header-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["profile-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (!data?.email) throw new Error("No email on account");
      if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");
      if (newPassword !== confirmPassword) throw new Error("New passwords do not match");
      if (!currentPassword) throw new Error("Enter your current password");

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error("Current password is incorrect");

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update password"),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Profile and account security.</p>

      <Card className="mt-8 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Photo and display name shown in the account menu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading || !data ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <ProfileAvatarBadge name={displayName} email={data.email} avatarUrl={avatarUrl} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm text-muted-foreground">{data.email}</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 size-4" />
                      )}
                      {avatarUrl ? "Change photo" : "Upload photo"}
                    </Button>
                    {avatarUrl ? (
                      <Button type="button" variant="ghost" size="sm" onClick={removePhoto}>
                        <Trash2 className="mr-2 size-4" />
                        Remove photo
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  autoComplete="name"
                />
              </div>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Save changes
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> Change password
          </CardTitle>
          <CardDescription>
            For email/password accounts. OAuth-only users should change password with their provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={() => passwordMutation.mutate()}
            disabled={passwordMutation.isPending || !currentPassword || !newPassword}
          >
            {passwordMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 size-4" />
            )}
            Update password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
