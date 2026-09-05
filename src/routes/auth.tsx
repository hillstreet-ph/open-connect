import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthMode = "signin" | "signup" | "reset" | "update_password";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: AuthMode } => {
    const raw = search["mode"];
    if (raw === "signup" || raw === "reset" || raw === "update_password") return { mode: raw };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Open-Connect" },
      {
        name: "description",
        content: "Sign in, create an account, or reset your password for Open-Connect.",
      },
      { property: "og:title", content: "Sign in — Open-Connect" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update_password");
        return;
      }
      if (event === "SIGNED_IN" && session && mode !== "update_password") {
        void navigate({ to: "/dashboard" });
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && mode !== "update_password" && mode !== "reset") {
        void navigate({ to: "/dashboard" });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, mode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        await navigate({ to: "/dashboard" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to verify it.");
        setMode("signin");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?mode=update_password`,
        });
        if (error) throw error;
        toast.success("Password reset email sent. Open the link to set a new password.");
        setMode("signin");
      } else if (mode === "update_password") {
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated");
        await navigate({ to: "/dashboard" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "github" | "google") {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
    } catch (error) {
      setBusy(false);
      toast.error(
        error instanceof Error
          ? error.message
          : `${provider} sign-in failed. Use email/password or check Auth providers.`,
      );
    }
  }

  const title =
    mode === "signup"
      ? "Create account"
      : mode === "reset"
        ? "Forgot password"
        : mode === "update_password"
          ? "Set new password"
          : "Sign in";

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center bg-hero px-4 py-16">
      <div className="absolute inset-0 grid-lines opacity-50" aria-hidden />
      <Card className="relative w-full max-w-md shadow-panel">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {mode === "signup"
              ? "Create your account to connect apps, models and resources."
              : mode === "reset"
                ? "Enter your email and we'll send a reset link."
                : mode === "update_password"
                  ? "Choose a new password for your Open-Connect account."
                  : "Sign in to your Open-Connect dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="displayName">Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                />
              </div>
            ) : null}

            {mode !== "update_password" ? (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            ) : null}

            {mode !== "reset" ? (
              <div className="space-y-2">
                <Label htmlFor="password">
                  {mode === "update_password" ? "New password" : "Password"}
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signup" || mode === "update_password" ? "new-password" : "current-password"}
                />
              </div>
            ) : null}

            {mode === "update_password" ? (
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send reset link"
                  : mode === "update_password"
                    ? "Update password"
                    : "Sign in"}
            </Button>
          </form>

          {mode === "signin" || mode === "signup" ? (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleOAuth("github")}
                  disabled={busy}
                >
                  Continue with GitHub
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => handleOAuth("google")}
                  disabled={busy}
                >
                  Continue with Google
                </Button>
              </div>
            </>
          ) : null}

          <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                <button type="button" className="hover:text-foreground" onClick={() => setMode("reset")}>
                  Forgot password?
                </button>
                <p>
                  Don't have an account?{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setMode("signup")}>
                    Create account
                  </button>
                </p>
              </>
            ) : mode === "update_password" ? null : (
              <p>
                Already have an account?{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </p>
            )}
            <p className="text-xs">
              <Link to="/" className="hover:text-foreground">
                Back to home
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
