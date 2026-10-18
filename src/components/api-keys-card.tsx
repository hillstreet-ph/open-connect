import { McpConnectionCard } from "@/components/mcp-connection-card";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  updateApiKeyAccess,
} from "@/lib/api-keys.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACCESS_PROFILES,
  isAccessProfile,
  scopesForProfile,
  type AccessProfile,
} from "@/lib/access-profiles";
import { listProjects } from "@/lib/orgs.functions";
import { getMyRoles } from "@/lib/roles.functions";
import { hasRole } from "@/lib/rbac";

const PROFILE_LABELS: Record<AccessProfile, string> = {
  read_only: "Read only",
  builder: "Builder",
  developer: "Developer",
  administrator: "Administrator",
  custom: "Custom",
};

export function ApiKeysCard() {
  const queryClient = useQueryClient();
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const update = useServerFn(updateApiKeyAccess);
  const getRoles = useServerFn(getMyRoles);
  const listProj = useServerFn(listProjects);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<AccessProfile>("developer");
  const [projectId, setProjectId] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => list({}),
    refetchInterval: 30_000,
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProj({}) });
  const roles = useQuery({ queryKey: ["my-roles"], queryFn: () => getRoles({}) });
  const isAdmin = hasRole(roles.data ?? [], "admin");

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; profile: AccessProfile; scopes: string[] }) =>
      update({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Permissions updated. Connected clients may take 30 seconds to refresh.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update permissions"),
  });

  const createMutation = useMutation({
    mutationFn: (keyName: string) =>
      create({ data: { name: keyName, profile, projectId: projectId || undefined } }),
    onSuccess: (result) => {
      setFreshKey(result.key);
      setName("");
      setProjectId("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key created — copy it now, it won't be shown again.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create key"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key revoked");
    },
  });

  return (
    <div className="space-y-6">
      <Card className="shadow-panel">
        <CardHeader>
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <KeyRound className="size-4" />
          </span>
          <CardTitle className="mt-3 text-base">API Keys</CardTitle>
          <CardDescription>
            Scoped <code className="font-mono">oc_live_</code> keys authenticate your agents against{" "}
            <code className="font-mono">/mcp</code> and <code className="font-mono">/v1</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_170px_220px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate(name);
            }}
          >
            <Input
              aria-label="API key name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name (e.g. local agent)"
            />
            <select
              aria-label="Access profile"
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={profile}
              onChange={(event) => setProfile(event.target.value as AccessProfile)}
            >
              {(Object.keys(PROFILE_LABELS) as AccessProfile[])
                .filter((value) => value !== "custom" && (isAdmin || value !== "administrator"))
                .map((value) => (
                  <option key={value} value={value}>
                    {PROFILE_LABELS[value]}
                  </option>
                ))}
            </select>
            <select
              aria-label="Project scope"
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">All accessible projects</option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            {profile === "administrator"
              ? "Full resource, tool, action, model, agent, connection, and control access."
              : `${ACCESS_PROFILES[profile as Exclude<AccessProfile, "custom">]?.length ?? 0} least-privilege scopes selected.`}{" "}
            Secret values remain non-exportable; agents receive opaque credential references.
          </p>

          {freshKey ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                Copy this key now — it is only shown once.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all font-mono text-xs text-primary">{freshKey}</code>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Copy API key"
                  onClick={() => {
                    void navigator.clipboard.writeText(freshKey).then(
                      () => toast.success("Copied"),
                      () => toast.error("Could not copy key"),
                    );
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}

          {keys.isLoading ? (
            <p role="status">Loading keys…</p>
          ) : keys.isError ? (
            <p role="alert">Could not load keys. Refresh and try again.</p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {keys.data?.length ? (
              keys.data.map((key) => (
                <li
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{key.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {key.key_prefix}…
                    </span>
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {PROFILE_LABELS[(key.access_profile as AccessProfile) ?? "custom"] ??
                        "Legacy"}
                    </Badge>
                    {key.project_id ? (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Project scoped
                      </Badge>
                    ) : null}
                  </span>
                  {key.active ? (
                    <KeyAccessEditor
                      key={`${key.id}:${key.access_profile}:${key.scopes?.join(",")}`}
                      name={key.name}
                      profile={key.access_profile}
                      scopes={key.scopes ?? []}
                      isAdmin={isAdmin}
                      pending={updateMutation.isPending}
                      onApply={(profile, scopes) =>
                        updateMutation.mutate({ id: key.id, profile, scopes })
                      }
                    />
                  ) : null}
                  {key.revoked_at ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Revoked
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeMutation.mutate(key.id)}
                      disabled={revokeMutation.isPending}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))
            ) : !keys.isLoading && !keys.isError ? (
              <li className="text-muted-foreground">No keys yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
      <McpConnectionCard key={freshKey ? "fresh" : "existing"} freshKey={freshKey} />
    </div>
  );
}

function KeyAccessEditor(props: {
  name: string;
  profile: string;
  scopes: string[];
  isAdmin: boolean;
  pending: boolean;
  onApply: (profile: AccessProfile, scopes: string[]) => void;
}) {
  const initial = isAccessProfile(props.profile) ? props.profile : "custom";
  const [profile, setProfile] = useState<AccessProfile>(initial);
  const expected = scopesForProfile(profile, props.scopes);
  const changed =
    profile !== props.profile ||
    expected.length !== props.scopes.length ||
    expected.some((scope) => !props.scopes.includes(scope));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Permissions for ${props.name}`}
        value={profile}
        onChange={(event) => setProfile(event.target.value as AccessProfile)}
        className="h-9 max-w-36 rounded-md border border-input bg-background px-2 text-sm"
        disabled={props.pending}
      >
        {(Object.keys(PROFILE_LABELS) as AccessProfile[])
          .filter((value) => props.isAdmin || value !== "administrator" || initial === value)
          .map((value) => (
            <option key={value} value={value}>
              {PROFILE_LABELS[value]}
            </option>
          ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={props.pending || !changed || (profile === "administrator" && !props.isAdmin)}
        onClick={() => props.onApply(profile, profile === "custom" ? props.scopes : [])}
      >
        Apply permissions
      </Button>
    </div>
  );
}
