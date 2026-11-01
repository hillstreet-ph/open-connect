import { McpConnectionCard } from "@/components/mcp-connection-card";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  createApiKey,
  listApiKeys,
  renameApiKey,
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
import { formatDateTime, formatRelative } from "@/lib/date-time";

const PROFILE_LABELS: Record<AccessProfile, string> = {
  read_only: "Read only",
  builder: "Builder",
  developer: "Developer",
  administrator: "Administrator · full control",
  custom: "Custom",
};

export function ApiKeysCard({ modelOnly = false }: { modelOnly?: boolean }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const rename = useServerFn(renameApiKey);
  const update = useServerFn(updateApiKeyAccess);
  const getRoles = useServerFn(getMyRoles);
  const listProj = useServerFn(listProjects);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<AccessProfile>("developer");
  const [projectId, setProjectId] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);

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
      toast.success("Permissions updated. New requests use the updated permissions.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update permissions"),
  });

  const createMutation = useMutation({
    mutationFn: (keyName: string) =>
      create({ data: { name: keyName, modelOnly, profile, projectId: projectId || undefined } }),
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

  const visibleKeys = (keys.data ?? []).filter(
    (key) => key.key_prefix.startsWith("sk-oc-") === modelOnly,
  );

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setFreshKey(null);
      toast.success("Key revoked and removed");
    },
  });

  const renameMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) => rename({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key renamed");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not rename key"),
  });

  return (
    <div className="space-y-6">
      <Card className="shadow-panel">
        <CardHeader>
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <KeyRound className="size-4" />
          </span>
          <CardTitle className="mt-3 text-base">
            {modelOnly ? "API Keys" : "Personal Token"}
          </CardTitle>
          <CardDescription>
            {modelOnly
              ? "Create a model-scoped sk-oc- API Key for https://open-connect.site/v1. Connect your model providers below first."
              : "Create oc_live_ Personal Tokens for MCP tools, resources and agent actions. Administrators can select Administrator · full control. Model keys are managed in AI Gateway."}
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
              aria-label={modelOnly ? "API key name" : "Token name"}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name (e.g. local agent)"
            />
            <select
              disabled={modelOnly}
              aria-label="Access profile"
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={modelOnly ? "custom" : profile}
              onChange={(event) => setProfile(event.target.value as AccessProfile)}
            >
              {modelOnly ? <option value="custom">Models only</option> : null}
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
            {modelOnly
              ? "Model listing and inference only."
              : profile === "administrator"
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

          <div className="space-y-2">
            <button
              type="button"
              aria-expanded={keysOpen}
              onClick={() => setKeysOpen((open) => !open)}
              className="flex w-full items-center gap-1.5 text-left text-sm font-medium"
            >
              {keysOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              Generated keys
              <span className="text-xs font-normal text-muted-foreground">
                ({visibleKeys.length})
              </span>
            </button>
            {keysOpen ? (
              <>
                {keys.isLoading ? (
                  <p role="status">Loading keys…</p>
                ) : keys.isError ? (
                  <p role="alert">Could not load keys. Refresh and try again.</p>
                ) : null}
                <ul className="space-y-2 text-sm">
                  {visibleKeys.length ? (
                    visibleKeys.map((key) => (
                      <li key={key.id} className="rounded-lg border border-border px-3 py-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <KeyNameEditor
                                name={key.name}
                                editable={key.active && !key.revoked_at}
                                pending={renameMutation.isPending}
                                onRename={(name) => renameMutation.mutate({ id: key.id, name })}
                              />
                              {key.active && !key.revoked_at ? (
                                <Badge
                                  variant="secondary"
                                  className="border-transparent bg-success/15 text-[10px] text-success"
                                >
                                  Active
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-muted-foreground"
                                >
                                  {key.revoked_at ? "Revoked" : "Inactive"}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-xs text-muted-foreground">
                                {key.key_prefix}…
                              </span>
                              <Badge variant="secondary" className="text-[10px]">
                                {key.key_prefix.startsWith("sk-oc-")
                                  ? "Models only"
                                  : (PROFILE_LABELS[
                                      (key.access_profile as AccessProfile) ?? "custom"
                                    ] ?? "Legacy")}
                              </Badge>
                              {key.project_id ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Project scoped
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                              <span>Created {formatDateTime(key.created_at)}</span>
                              {" · "}
                              <span>
                                {key.last_used_at
                                  ? `Last used ${formatDateTime(key.last_used_at)}`
                                  : "Never used"}
                              </span>
                              {key.expires_at ? ` · Expires ${formatRelative(key.expires_at)}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {key.active && !key.key_prefix.startsWith("sk-oc-") ? (
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
                            {key.revoked_at ? null : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => revokeMutation.mutate(key.id)}
                                disabled={revokeMutation.isPending}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))
                  ) : !keys.isLoading && !keys.isError ? (
                    <li className="text-muted-foreground">No keys yet.</li>
                  ) : null}
                </ul>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {!modelOnly ? (
        <McpConnectionCard key={freshKey ? "fresh" : "existing"} freshKey={freshKey} />
      ) : null}
    </div>
  );
}

function KeyNameEditor(props: {
  name: string;
  editable: boolean;
  pending: boolean;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(props.name);

  if (!editing) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="truncate font-medium">{props.name}</span>
        {props.editable ? (
          <button
            type="button"
            aria-label={`Rename ${props.name}`}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setValue(props.name);
              setEditing(true);
            }}
          >
            <Pencil className="size-3" />
          </button>
        ) : null}
      </span>
    );
  }

  const submit = () => {
    const next = value.trim();
    if (!next || next === props.name) {
      setEditing(false);
      return;
    }
    props.onRename(next);
    setEditing(false);
  };

  return (
    <span className="flex items-center gap-1">
      <Input
        aria-label="New key name"
        value={value}
        autoFocus
        disabled={props.pending}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        className="h-7 max-w-40 text-sm"
      />
      <Button
        size="sm"
        variant="ghost"
        aria-label="Save key name"
        disabled={props.pending}
        onClick={submit}
      >
        <Check className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Cancel rename"
        disabled={props.pending}
        onClick={() => setEditing(false)}
      >
        <X className="size-3.5" />
      </Button>
    </span>
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
