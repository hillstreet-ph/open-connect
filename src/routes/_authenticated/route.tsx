import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifyPersistentSession } from "@/lib/persistent-session";
import { WorkspaceShell } from "@/components/workspace-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await verifyPersistentSession(() => supabase.auth.getUser());
    if (!user) throw redirect({ to: "/auth", search: { returnTo: location.href } });
    return { user };
  },
  component: () => (
    <WorkspaceShell>
      <Outlet />
    </WorkspaceShell>
  ),
});
