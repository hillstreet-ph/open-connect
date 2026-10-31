import { createFileRoute, useLocation } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { adminTab } from "@/lib/settings-navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationPanel } from "@/components/organization-panel";
import { AccessReferencePanel } from "@/components/access-reference-panel";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "System administration — Open-Connect" },
      { name: "description", content: "Organization, people, and role-based access control." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = Route.useNavigate();
  const location = useLocation();
  const { primary } = useRoles();
  const active = adminTab(location.hash);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
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

      <Tabs
        value={active}
        onValueChange={(value) => {
          void navigate({ hash: adminTab(value), replace: true });
        }}
        className="mt-8"
      >
        <TabsList
          aria-label="System administration sections"
          className="h-auto w-full flex-wrap justify-start gap-2"
        >
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="access">Access reference</TabsTrigger>
        </TabsList>
        <TabsContent value="organization">
          <OrganizationPanel />
        </TabsContent>
        <TabsContent value="access">
          <AccessReferencePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
