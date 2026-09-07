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

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function detectFromFile(file: File) {
  let contentText = "";
  if (!isArchiveFilename(file.name) && file.size < 512_000) {
    try {
      contentText = await file.text();
    } catch {
      /* binary */
    }
  }
  return detectResourceMeta({ filename: file.name, contentText });
}

/** Upload / manage packages — bulk auto-detect into catalog types. */
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
  const [bulkProgress, setBulkProgress] = useState<string>("");

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
    const meta = await detectFromFile(next);
    setName(meta.name);
    setSlug(meta.slug);
    setDescription(meta.description);
    setResourceType(meta.resource_type);
    setSignals(meta.signals);
    setConfidence(meta.confidence);
  }

  async function uploadOne(
    fileObj: File,
    override?: { name: string; slug: string; description: string; resource_type: string },
  ) {
    if (fileObj.size > MAX_BYTES) throw new Error(`${fileObj.name} exceeds 50MB`);
    const meta = override ?? (await detectFromFile(fileObj));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const path = `${user.id}/${Date.now()}-${meta.slug}-${fileObj.name}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, fileObj, {
      upsert: false,
      contentType: fileObj.type || "application/octet-stream",
    });
    if (upErr) throw new Error(upErr.message);

    await registerFn({
      data: {
        name: meta.name,
        slug: `${meta.slug}-${Date.now().toString(36).slice(-4)}`,
        description: meta.description,
        resource_type: meta.resource_type as (typeof TYPES)[number],
        package_path: path,
        package_filename: fileObj.name,
        package_size: fileObj.size,
        package_mime: fileObj.type || "application/octet-stream",
        published: true,
        version: "1.0.0",
      },
    });
  }

  async function uploadAndRegister() {
    if (!file) return;
    setBusy(true);
    try {
      await uploadOne(file, {
        name: name || file.name,
        slug: slug || "resource",
        description: description || "",
        resource_type: resourceType,
      });
      toast.success("Published to catalog");
      setFile(null);
      setName("");
      setSlug("");
      setDescription("");
      setSignals([]);
      setConfidence("");
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["my-resources"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkUpload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      setBulkProgress(`${i + 1}/${list.length} · ${f.name}`);
      try {
        await uploadOne(f);
        ok += 1;
      } catch (e) {
        fail += 1;
        console.warn("[bulk]", f.name, e);
      }
    }
    setBulkProgress("");
    setBusy(false);
    toast.success(`Bulk done · ${ok} published${fail ? ` · ${fail} failed` : ""}`);
    void queryClient.invalidateQueries({ queryKey: ["my-resources"] });
    if (fileRef.current) fileRef.current.value = "";
  }

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadFn({ data: { id } }),
    onSuccess: (res) => {
      if (res && "url" in res && res.url) window.open(res.url, "_blank");
      else if (res && "content" in res) {
        const blob = new Blob([String((res as { content: string }).content)], {
          type: "text/markdown",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (res as { filename?: string }).filename ?? "resource.md";
        a.click();
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Download failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      void queryClient.invalidateQueries({ queryKey: ["my-resources"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <Card className="shadow-panel" id="upload">
      <CardHeader>
        <CardTitle className="text-base">Package library</CardTitle>
        <CardDescription>
          Upload .zip / .md / manifests — auto-detect skill · MCP · plugin · agent · prompt and publish
          to the catalog. Select multiple files for bulk upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pkg-file">Files</Label>
          <Input
            id="pkg-file"
            ref={fileRef}
            type="file"
            multiple
            accept=".zip,.md,.json,.yaml,.yml,.txt,application/zip"
            onChange={(e) => {
              const files = e.target.files;
              if (!files?.length) return;
              if (files.length === 1) void onPickFile(files[0]!);
              else void bulkUpload(files);
            }}
          />
          {bulkProgress ? <p className="text-xs text-primary">{bulkProgress}</p> : null}
          {file && !bulkProgress ? (
            <p className="text-xs text-muted-foreground">
              {file.name} · {formatBytes(file.size)}
              {confidence ? ` · detect ${confidence}` : ""}
              {signals.length ? ` · ${signals.join(", ")}` : ""}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pkg-name">Name</Label>
            <Input id="pkg-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-type">Catalog type</Label>
            <select
              id="pkg-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            <Label htmlFor="pkg-slug">Slug</Label>
            <Input
              id="pkg-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pkg-desc">Description</Label>
            <Input
              id="pkg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
                        aria-label="Download"
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(r.id)}
                      disabled={deleteMutation.isPending}
                      aria-label="Delete"
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
