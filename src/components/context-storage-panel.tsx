import { useState, useRef } from "react";
import { useRouteContext, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, BookOpen, HardDrive, Upload, Eye, Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getContextStorage,
  getContextRecord,
  getContextFileUrl,
  removeContextFile,
  type StoredContextFile,
} from "@/lib/context-storage.functions";
import {
  CONTEXT_FILE_BUCKET,
  CONTEXT_FILE_LIMIT,
  formatStorageBytes,
  previewableImage,
  storedFileLabel,
} from "@/lib/context-storage";
export function ContextStoragePanel() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  return <OwnedStorage key={user.id} userId={user.id} />;
}
function OwnedStorage({ userId }: { userId: string }) {
  const overviewFn = useServerFn(getContextStorage),
    detailFn = useServerFn(getContextRecord),
    urlFn = useServerFn(getContextFileUrl),
    deleteFn = useServerFn(removeContextFile);
  const client = useQueryClient(),
    input = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [detail, setDetail] = useState<{
    title: string;
    content?: string;
    image?: string;
    info: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ["context-storage", userId, cursor],
    queryFn: () => overviewFn({ data: cursor ? { after: cursor } : {} }),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["context-storage", userId] });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > CONTEXT_FILE_LIMIT) throw new Error("Files must be 10 MB or smaller");
      const name = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-150) || "file";
      const path = `${userId}/files/${crypto.randomUUID()}-${name}`;
      const { error } = await supabase.storage.from(CONTEXT_FILE_BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setCursor(undefined);
      void refresh();
      toast.success("File saved to your private storage");
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => {
      if (input.current) input.current.value = "";
    },
  });
  const preview = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: "memory" | "knowledge" }) => {
      const row = await detailFn({ data: { id, kind } });
      setDetail({
        title: row.title,
        content: row.content,
        info: `${formatStorageBytes(new TextEncoder().encode(row.content).length)} · Updated ${new Date(row.updated_at).toLocaleString()} · ${(row.tags ?? []).join(", ")}`,
      });
    },
    onError: (e) => toast.error(e.message),
  });
  const fileAction = useMutation({
    mutationFn: async ({ file, download }: { file: StoredContextFile; download: boolean }) => {
      const { url } = await urlFn({ data: { path: file.name, download } });
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.rel = "noopener";
        a.download = storedFileLabel(file.name);
        a.click();
      } else
        setDetail({
          title: storedFileLabel(file.name),
          image: url,
          info: `${file.mime_type} · ${formatStorageBytes(file.bytes)} · Preview expires in 60 seconds`,
        });
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (path: string) => deleteFn({ data: { path } }),
    onSuccess: () => {
      void refresh();
      toast.success("File deleted; saved context text is retained");
    },
    onError: (e) => toast.error(e.message),
  });
  if (query.isPending)
    return <p className="text-sm text-muted-foreground">Loading context and storage…</p>;
  if (query.isError || !query.data)
    return (
      <Card>
        <CardContent className="p-5">
          <p role="alert">Could not load private storage.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  const data = query.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "Memory",
            icon: Brain,
            value: data.memory,
            caption: "Saved memories · text size",
          },
          {
            title: "Knowledge",
            icon: BookOpen,
            value: data.knowledge,
            caption: "Active sources · text size",
          },
          {
            title: "Files & images",
            icon: HardDrive,
            value: data.storage,
            caption: "Private files · stored size",
          },
        ].map(({ title, icon: Icon, value, caption }) => (
          <Card key={title}>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4" />
                {title}
              </p>
              <p className="mt-3 text-2xl font-semibold">{value.count.toLocaleString()}</p>
              <p className="text-sm">{formatStorageBytes(value.bytes)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            { kind: "memory", title: "Memory preview", rows: data.memories, to: "/memory" },
            {
              kind: "knowledge",
              title: "Knowledge preview",
              rows: data.knowledge_items,
              to: "/knowledge",
            },
          ] as const
        ).map((group) => (
          <Card key={group.kind}>
            <CardHeader>
              <CardTitle className="text-base">{group.title}</CardTitle>
              <CardDescription>Your five most recently updated records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.rows.map((row) => (
                <button
                  key={row.id}
                  className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  disabled={preview.isPending}
                  onClick={() => preview.mutate({ id: row.id, kind: group.kind })}
                >
                  <p className="break-words font-medium">{row.title}</p>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                    {row.preview}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {row.kind} · {formatStorageBytes(row.bytes)} · View details
                  </p>
                </button>
              ))}
              {!group.rows.length && (
                <p className="text-sm text-muted-foreground">No saved records yet.</p>
              )}
              <Button variant="link" asChild>
                <Link to={group.to}>Manage {group.kind}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Private files & images</CardTitle>
          <CardDescription>
            Store documents and images here, or attach them in Memory and Knowledge. Up to 10 MB per
            file. Text sizes exclude database overhead; file storage includes original uploads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={input}
            type="file"
            className="sr-only"
            aria-label="Upload a private file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
            }}
          />
          <Button
            variant="outline"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <Upload className="size-4" />
            {upload.isPending ? "Uploading…" : "Upload file or image"}
          </Button>
          {data.files.map((file) => (
            <div
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">{storedFileLabel(file.name)}</p>
                <p className="text-xs text-muted-foreground">
                  {file.mime_type || "File"} · {formatStorageBytes(file.bytes)} ·{" "}
                  {new Date(file.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1">
                {previewableImage(file.mime_type ?? "") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Preview ${storedFileLabel(file.name)}`}
                    disabled={fileAction.isPending}
                    onClick={() => fileAction.mutate({ file, download: false })}
                  >
                    <Eye className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Download ${storedFileLabel(file.name)}`}
                  disabled={fileAction.isPending}
                  onClick={() => fileAction.mutate({ file, download: true })}
                >
                  <Download className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${storedFileLabel(file.name)}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this file? Attached context text will remain, but the file download will no longer work.",
                      )
                    )
                      remove.mutate(file.name);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {!data.files.length && (
            <p className="text-sm text-muted-foreground">No files on this page.</p>
          )}
          <div className="flex gap-2">
            {cursor && (
              <Button variant="outline" onClick={() => setCursor(undefined)}>
                First page
              </Button>
            )}
            {data.files.length === 50 && (
              <Button
                variant="outline"
                onClick={() => setCursor(data.files[data.files.length - 1]!.name)}
              >
                Next 50 files
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-words">{detail?.title}</DialogTitle>
            <DialogDescription>{detail?.info}</DialogDescription>
          </DialogHeader>
          {detail?.image ? (
            <img
              src={detail.image}
              alt={detail.title}
              className="max-h-[55dvh] w-full rounded-lg object-contain"
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-sans text-sm">
              {detail?.content}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
