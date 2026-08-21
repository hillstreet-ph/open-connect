import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { detectResourceMeta, isArchiveFilename } from "@/lib/resource-detect";
import {
  deleteMyResource,
  getResourceDownloadUrl,
  listMyResources,
  registerResourcePackage,
} from "@/lib/resources.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TYPES = ["skill", "mcp", "tool", "plugin", "agent", "prompt", "guide"] as const;
const BUCKET = "resource-packages";
const MAX_BYTES = 50 * 1024 * 1024;

export function ResourceLibraryCard() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const listFn = useServerFn(listMyResources);
  const registerFn = useServerFn(registerResourcePackage);
  const downloadFn = useServerFn(getResourceDownloadUrl);
  const deleteFn = useServerFn(deleteMyResource);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState<string>("skill");
  const [signals, setSignals] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const mine = useQuery({
    queryKey: ["my-resources"],
    queryFn: async () => {
      try {
        return await listFn({});
      } catch (e) {
        console.warn("[my-resources]", e);
        return [];
      }
    },
    retry: false,
  });

  async function onPickFile(next: File | null) {
    setFile(next);
    if (!next) return;

    let contentText = "";
    if (!isArchiveFilename(next.name) && next.size < 512_000) {
      try {
        contentText = await next.text();
      } catch {
        contentText = "";
      }
    }

    const detected = detectResourceMeta({ filename: next.name, contentText });
    setName(detected.name);
    setSlug(detected.slug);
    setDescription(detected.description);
    setResourceType(detected.resource_type);
    setSignals(detected.signals);
    setConfidence(detected.confidence);
  }

  async function uploadAndRegister() {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Max package size is 50 MB");
      return;
    }

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in required");
        return;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${user.id}/${Date.now()}-${safeName}`;

      const { error: upError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upError) throw upError;

      await registerFn({
        data: {
          name: name || file.name,
          slug: slug || "resource",
          description,
          resource_type: resourceType,
          package_path: path,
          package_filename: file.name,
          package_size: file.size,
          package_mime: file.type || "application/octet-stream",
          published: true,
          version: "1.0.0",
        },
      });

      toast.success("Resource uploaded and published");
      setFile(null);
      setName("");
      setSlug("");
      setDescription("");
      setSignals([]);
      setConfidence("");
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["my-resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["profile-dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadFn({ data: { id } }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("Download started");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Download failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      void queryClient.invalidateQueries({ queryKey: ["my-resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <Card className="shadow-panel sm:col-span-2">
      <CardHeader>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Upload className="size-4" />
        </span>
        <CardTitle className="mt-3 text-base">Resource library — upload & download</CardTitle>
        <CardDescription>
          Drop a <code className="font-mono">.zip</code>, skill markdown, MCP config, agent pack, or prompt.
          Type is auto-detected; agents can pull packages via download links.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-file">Package file</Label>
            <Input
              id="resource-file"
              ref={fileRef}
              type="file"
              accept=".zip,.tgz,.tar,.gz,.md,.json,.txt,.yaml,.yml,.prompt"
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
                {confidence ? ` · detected ${resourceType} (${confidence})` : ""}
                {signals.length ? ` · ${signals.join(", ")}` : ""}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My skill" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resource-type">Type</Label>
            <select
              id="resource-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <Button onClick={() => void uploadAndRegister()} disabled={busy || !file}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
          Upload & publish
        </Button>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Your packages</h3>
          <ul className="space-y-2">
            {(mine.data ?? []).length === 0 ? (
              <li className="text-sm text-muted-foreground">No uploads yet.</li>
            ) : (
              mine.data?.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <Badge variant="secondary" className="mr-2 uppercase">
                        {r.resource_type}
                      </Badge>
                      {r.package_filename || r.slug || "untitled"}
                      {typeof r.package_size === "number" && r.package_size > 0
                        ? ` · ${formatBytes(r.package_size)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {r.package_path ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadMutation.mutate(r.id)}
                        disabled={downloadMutation.isPending}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(r.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
