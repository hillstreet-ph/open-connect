import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { assignRole, listRoleAssignments, revokeRole } from "@/lib/roles.functions";
import { ALL_ROLES, roleLabel, canRevokeRole, type AppRole } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "System administration — Open-Connect" },
      { name: "description", content: "Role-based access control." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const list = (roles ?? []).map((r) => r.role as AppRole);
    const ok = list.includes("admin") || list.includes("owner");
    if (!ok) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function AdminPage() {
  const queryClient = useQueryClient();
  const { primary, isOwner, roles } = useRoles();
  const { user } = useAuth();
  const listFn = useServerFn(listRoleAssignments);
  const assignFn = useServerFn(assignRole);
  const revokeFn = useServerFn(revokeRole);

  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AppRole>("user");

  const assignments = useQuery({
    queryKey: ["role-assignments"],
    queryFn: () => listFn({}),
  });

  const assignMutation = useMutation({
    mutationFn: () => assignFn({ data: { user_id: userId, role } }),
    onSuccess: () => {
      toast.success(`Assigned ${role}`);
      setUserId("");
      void queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Assign failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: (payload: { user_id: string; role: string }) => revokeFn({ data: payload }),
    onSuccess: () => {
      toast.success("Role revoked");
      void queryClient.invalidateQueries({ queryKey: ["role-assignments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Revoke failed"),
  });

  const grantable = ALL_ROLES.filter((r) => {
    if (r === "owner") return isOwner;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Shield className="size-5" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold">System administration</h1>
          <p className="text-sm text-muted-foreground">
            Your role: <Badge variant="secondary">{roleLabel(primary)}</Badge>
          </p>
        </div>
      </div>

      <Card className="mt-8 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Assign role</CardTitle>
          <CardDescription>
            Manage platform access for members, developers, publishers, admins, and owners.
            Organization and project memberships are managed separately. Only owners can manage the owner role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-user">Account ID</Label>
            <Input
              id="target-user"
              className="font-mono text-sm"
              placeholder="Account UUID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-select">Role</Label>
            <select
              id="role-select"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
            >
              {grantable.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending || !userId.trim()}
          >
            {assignMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 size-4" />
            )}
            Assign role
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Current assignments</CardTitle>
          <CardDescription>Up to 200 recent platform role assignments.</CardDescription>
        </CardHeader>
        <CardContent>
          {assignments.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : assignments.isError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>Could not load role assignments. Check your access and try again.</p>
              <Button variant="outline" onClick={() => void assignments.refetch()}>Try again</Button>
            </div>
          ) : (assignments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No role assignments found.</p>
          ) : (
            <ul className="space-y-2">
              {(assignments.data ?? []).map((row: { id: string; user_id: string; role: string }) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <Badge variant="secondary" className="mr-2">
                      {roleLabel(row.role as AppRole)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{row.user_id}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      revokeMutation.mutate({ user_id: row.user_id, role: row.role })
                    }
                    disabled={revokeMutation.isPending || !user || !canRevokeRole(roles, user.id, row.user_id, row.role as AppRole)}
                    aria-label={`Revoke ${roleLabel(row.role as AppRole)} role for ${row.user_id}`}
                    title={row.role === "owner" && !isOwner ? "Only owners can revoke this role" : row.user_id === user?.id && row.role === "admin" && !isOwner ? "You cannot revoke your own admin role" : "Revoke role"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/dashboard" className="text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
