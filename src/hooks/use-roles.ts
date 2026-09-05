import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  can,
  hasRole,
  highestRole,
  type AppRole,
  type Capability,
} from "@/lib/rbac";

export function useRoles() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["user-roles", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as AppRole[];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) {
        console.warn("[useRoles]", error.message);
        return ["user"] as AppRole[];
      }
      const roles = (data ?? []).map((r) => r.role as AppRole);
      return roles.length ? roles : (["user"] as AppRole[]);
    },
    staleTime: 60_000,
  });

  const roles: AppRole[] = query.data ?? (user ? ["user"] : []);
  const primary = highestRole(roles);

  return {
    roles,
    primary,
    loading: authLoading || (Boolean(user) && query.isLoading),
    isAdmin: hasRole(roles, "admin"),
    isOwner: hasRole(roles, "owner"),
    isPublisher: hasRole(roles, "publisher"),
    isDeveloper: hasRole(roles, "developer"),
    can: (capability: Capability) => can(roles, capability),
    hasRole: (required: AppRole) => hasRole(roles, required),
    refetch: query.refetch,
  };
}
