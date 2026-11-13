import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  Brain,
  CopyX,
  Download,
  Loader2,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listProjects } from "@/lib/orgs.functions";
import {
  archiveKnowledge,
  createKnowledge,
  createMemory,
  deleteMemory,
  listKnowledge,
  listMemories,
  removeDuplicateKnowledge,
  removeDuplicateMemories,
  setMemoryPinned,
  type KnowledgeSourceType,
  type MemoryType,
} from "@/lib/memory.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddContextToProject } from "@/components/add-context-to-project";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({
    meta: [
      { title: "Memory & Knowledge — Open-Connect" },
      {
        name: "description",
        content: "Durable memory and searchable knowledge for Open-Connect workspaces and agents.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MemoryPage,
});

function MemoryPage() {
  return <MemoryKnowledgePage defaultSection="memory" />;
}

const MEMORY_TYPES: MemoryType[] = ["fact", "preference", "decision", "instruction", "summary"];
const SOURCE_TYPES: KnowledgeSourceType[] = [
  "note",
  "document",
  "url",
  "repository",
  "conversation",
  "api",
];
const FILE_BUCKET = "memory-knowledge-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type UploadedFile = { name: string; path: string; mimeType: string; size: number };

function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function extractText(file: File) {
  if (
    file.type.startsWith("text/") ||
    /\.(md|mdx|json|csv|tsv|txt|log|yaml|yml|xml)$/i.test(file.name)
  ) {
    return (await file.text()).slice(0, 200_000);
  }
  return `Uploaded file: ${file.name} (${file.type || "application/octet-stream"}, ${file.size} bytes)`;
}

type KnowledgeExportRow = {
  id: string;
  title: string;
  content: string;
  source_type: string;
  source_url: string | null;
  tags: string[] | null;
};

function downloadKnowledgeFile(name: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function knowledgeToCsv(rows: KnowledgeExportRow[]) {
  const escape = (value: string) => '"' + value.split('"').join('""') + '"';
  const header = ["title", "content", "source_type", "source_url", "tags"].map(escape).join(",");
  const body = rows
    .map((row) =>
      [row.title, row.content, row.source_type, row.source_url ?? "", (row.tags ?? []).join(";")]
        .map((value) => escape(String(value ?? "")))
        .join(","),
    )
    .join("\n");
  return header + "\n" + body;
}

function knowledgeToMarkdown(rows: KnowledgeExportRow[]) {
  return rows
    .map((row) => {
      const lines = [
        "## " + row.title,
        row.content,
        row.source_url ? "Source: " + row.source_url : "",
        (row.tags ?? []).length ? "Tags: " + (row.tags ?? []).join(", ") : "",
      ];
      return lines.filter((line) => line.length > 0).join("\n\n");
    })
    .join("\n\n");
}

type ImportedKnowledge = {
  title: string;
  content: string;
  source_type?: string | undefined;
  source_url?: string | undefined;
  tags?: string[] | undefined;
};

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (quoted) {
      if (character === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function parseImportedRecord(item: Record<string, unknown>): ImportedKnowledge {
  return {
    title: typeof item["title"] === "string" ? item["title"].trim() : "",
    content: typeof item["content"] === "string" ? item["content"].trim() : "",
    source_type: typeof item["source_type"] === "string" ? item["source_type"] : undefined,
    source_url: typeof item["source_url"] === "string" ? item["source_url"] : undefined,
    tags: Array.isArray(item["tags"])
      ? (item["tags"] as unknown[]).filter((tag): tag is string => typeof tag === "string")
      : undefined,
  };
}

async function parseKnowledgeImport(file: File): Promise<ImportedKnowledge[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    const parsed: unknown = JSON.parse(await file.text());
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null
        ? [parsed]
        : [];
    return (list as Array<Record<string, unknown>>)
      .map(parseImportedRecord)
      .filter((item) => item.title && item.content);
  }
  const text = await file.text();
  if (name.endsWith(".csv")) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) return [];
    const header = parseCsvLine(lines[0] ?? "").map((value) => value.trim().toLowerCase());
    const titleIndex = header.indexOf("title");
    const contentIndex = header.indexOf("content");
    const sourceTypeIndex = header.indexOf("source_type");
    const sourceUrlIndex = header.indexOf("source_url");
    const tagsIndex = header.indexOf("tags");
    return lines
      .slice(1)
      .map((line) => {
        const fields = parseCsvLine(line);
        return {
          title: (fields[titleIndex] ?? "").trim(),
          content: (fields[contentIndex] ?? "").trim(),
          source_type: sourceTypeIndex >= 0 ? (fields[sourceTypeIndex] ?? "").trim() : undefined,
          source_url: sourceUrlIndex >= 0 ? (fields[sourceUrlIndex] ?? "").trim() : undefined,
          tags:
            tagsIndex >= 0 && (fields[tagsIndex] ?? "").trim()
              ? (fields[tagsIndex] ?? "")
                  .split(";")
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              : undefined,
        };
      })
      .filter((item) => item.title && item.content);
  }
  if (/\.md$|\.markdown$|\.txt$/.test(name)) {
    const sections = text.split(/\n(?=## )/g).filter((section) => section.trim().length > 0);
    if (sections.length > 1 || text.trim().startsWith("## ")) {
      return sections
        .map((section) => {
          const heading = section.split("\n")[0] ?? "";
          const title = heading.replace(/^##\s*/, "").trim();
          const content = section.split("\n").slice(1).join("\n").trim();
          return { title, content, source_type: "note" as const };
        })
        .filter((item) => item.title && item.content);
    }
    return [
      {
        title: file.name.replace(/\.[^.]+$/, "").trim(),
        content: text.trim(),
        source_type: "note" as const,
      },
    ].filter((item) => item.content);
  }
  throw new Error("Import supports .json, .md, .markdown, .txt, and .csv files");
}

function ProjectSelect({
  value,
  onChange,
  projects,
}: {
  value: string;
  onChange: (value: string) => void;
  projects: Array<{ id: string; name: string }>;
}) {
  return (
    <select
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Personal / all projects</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}

export function MemoryKnowledgePage({
  defaultSection,
  studioMode = false,
}: {
  defaultSection: "memory" | "knowledge";
  studioMode?: boolean;
}) {
  const qc = useQueryClient();
  const listProj = useServerFn(listProjects);
  const getMemories = useServerFn(listMemories);
  const addMemory = useServerFn(createMemory);
  const pinMemory = useServerFn(setMemoryPinned);
  const removeMemory = useServerFn(deleteMemory);
  const getKnowledge = useServerFn(listKnowledge);
  const addKnowledge = useServerFn(createKnowledge);
  const removeKnowledge = useServerFn(archiveKnowledge);
  const dedupeMemories = useServerFn(removeDuplicateMemories);
  const dedupeKnowledge = useServerFn(removeDuplicateKnowledge);

  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryType, setMemoryType] = useState<MemoryType>("fact");
  const [importance, setImportance] = useState(3);
  const [memoryTags, setMemoryTags] = useState("");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("note");
  const [sourceUrl, setSourceUrl] = useState("");
  const [knowledgeTags, setKnowledgeTags] = useState("");
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);
  const memoryFileRef = useRef<HTMLInputElement>(null);
  const knowledgeFileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File, kind: "memory" | "knowledge"): Promise<UploadedFile> {
    if (file.size > MAX_FILE_BYTES) throw new Error("Files must be 10 MB or smaller");
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Sign in before uploading files");
    const path = `${data.user.id}/${projectId || "personal"}/${kind}/${crypto.randomUUID()}-${safeFileName(file.name) || "file"}`;
    const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;
    return {
      name: file.name,
      path,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };
  }

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProj({}) });
  const memories = useQuery({
    queryKey: ["memories", projectId],
    queryFn: () => getMemories({ data: { projectId: projectId || undefined } }),
  });
  const knowledge = useQuery({
    queryKey: ["knowledge", projectId, query],
    queryFn: () =>
      getKnowledge({ data: { projectId: projectId || undefined, query: query || undefined } }),
  });
  const projectOptions = useMemo(
    () => (projects.data ?? []).map((project) => ({ id: project.id, name: project.name })),
    [projects.data],
  );
  const projectNames = useMemo(
    () => new Map(projectOptions.map((project) => [project.id, project.name])),
    [projectOptions],
  );
  const visibleMemories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return memories.data ?? [];
    return (memories.data ?? []).filter((item) =>
      [item.title, item.content, ...(item.tags ?? [])].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [memories.data, query]);

  const memoryMutation = useMutation({
    mutationFn: async () => {
      const file = memoryFile ? await uploadFile(memoryFile, "memory") : undefined;
      const content = memoryContent.trim() || (memoryFile ? await extractText(memoryFile) : "");
      return addMemory({
        data: {
          title: memoryTitle.trim() || memoryFile?.name || "",
          content,
          memoryType,
          importance,
          projectId: projectId || undefined,
          tags: memoryTags,
          file,
        },
      });
    },
    onSuccess: () => {
      toast.success("Memory saved");
      setMemoryTitle("");
      setMemoryContent("");
      setMemoryTags("");
      setMemoryFile(null);
      if (memoryFileRef.current) memoryFileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save memory"),
  });
  const pinMutation = useMutation({
    mutationFn: (input: { id: string; pinned: boolean }) => pinMemory({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["memories"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeMemory({ data: { id } }),
    onSuccess: () => {
      toast.success("Memory deleted");
      void qc.invalidateQueries({ queryKey: ["memories"] });
    },
  });
  const knowledgeMutation = useMutation({
    mutationFn: async () => {
      const file = knowledgeFile ? await uploadFile(knowledgeFile, "knowledge") : undefined;
      const content =
        knowledgeContent.trim() || (knowledgeFile ? await extractText(knowledgeFile) : "");
      return addKnowledge({
        data: {
          title: knowledgeTitle.trim() || knowledgeFile?.name || "",
          content,
          sourceType: knowledgeFile ? "document" : sourceType,
          sourceUrl: file ? undefined : sourceUrl || undefined,
          projectId: projectId || undefined,
          tags: knowledgeTags,
          file,
        },
      });
    },
    onSuccess: (result) => {
      if ("duplicate" in result && result.duplicate)
        toast.info("This source link is already in Knowledge");
      else toast.success("Knowledge added");
      setKnowledgeTitle("");
      setKnowledgeContent("");
      setSourceUrl("");
      setKnowledgeTags("");
      setKnowledgeFile(null);
      if (knowledgeFileRef.current) knowledgeFileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add knowledge"),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => removeKnowledge({ data: { id } }),
    onSuccess: () => {
      toast.success("Knowledge archived");
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
  const dedupeMemoryMutation = useMutation({
    mutationFn: () => dedupeMemories({ data: { projectId: projectId || undefined } }),
    onSuccess: ({ removed }) => {
      toast.success(
        removed
          ? `Removed ${removed} duplicate ${removed === 1 ? "memory" : "memories"}`
          : "No duplicate memories found",
      );
      void qc.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Duplicate cleanup failed"),
  });
  const dedupeKnowledgeMutation = useMutation({
    mutationFn: () => dedupeKnowledge({ data: { projectId: projectId || undefined } }),
    onSuccess: ({ removed }) => {
      toast.success(
        removed
          ? `Archived ${removed} duplicate knowledge ${removed === 1 ? "item" : "items"}`
          : "No duplicate knowledge found",
      );
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Duplicate cleanup failed"),
  });

  const importKnowledgeMutation = useMutation({
    mutationFn: async (file: File) => {
      const items = await parseKnowledgeImport(file);
      if (!items.length) throw new Error("No importable records were found in this file");
      let imported = 0;
      for (const item of items.slice(0, 200)) {
        try {
          await addKnowledge({
            data: {
              title: item.title.slice(0, 160),
              content: item.content,
              sourceType: (item.source_type &&
              SOURCE_TYPES.includes(item.source_type as KnowledgeSourceType)
                ? item.source_type
                : "note") as KnowledgeSourceType,
              sourceUrl: item.source_url,
              projectId: projectId || undefined,
              tags: (item.tags ?? []).join(", "),
            },
          });
          imported += 1;
        } catch {
          // Skip records that fail validation and continue importing the rest.
        }
      }
      return imported;
    },
    onSuccess: (imported) => {
      toast.success("Imported " + imported + " knowledge " + (imported === 1 ? "item" : "items"));
      void qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Import failed"),
  });

  const knowledgeRows: KnowledgeExportRow[] = (knowledge.data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    source_type: item.source_type,
    source_url: item.source_url,
    tags: item.tags,
  }));

  function exportKnowledge(format: "json" | "markdown" | "csv") {
    if (!knowledgeRows.length) {
      toast.error("Nothing to export in this scope");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      downloadKnowledgeFile(
        "open-connect-knowledge-" + stamp + ".json",
        JSON.stringify(knowledgeRows, null, 2),
        "application/json",
      );
    } else if (format === "markdown") {
      downloadKnowledgeFile(
        "open-connect-knowledge-" + stamp + ".md",
        knowledgeToMarkdown(knowledgeRows),
        "text/markdown",
      );
    } else {
      downloadKnowledgeFile(
        "open-connect-knowledge-" + stamp + ".csv",
        knowledgeToCsv(knowledgeRows),
        "text/csv",
      );
    }
  }

  return (
    <div
      className={studioMode ? "space-y-4" : "mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8"}
    >
      {!studioMode ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
                <Brain className="mr-1 size-3" /> AI context
              </Badge>
              <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {defaultSection === "memory" ? "Project Memory" : "Project Knowledge"}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {defaultSection === "memory"
                  ? "Store durable project decisions, instructions, preferences, and summaries."
                  : "Organize project documents, URLs, repositories, conversations, and reusable sources."}{" "}
                Records are private to your authenticated identity and can be scoped to each
                project.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <Label className="mb-2 block">Project scope</Label>
              <ProjectSelect value={projectId} onChange={setProjectId} projects={projectOptions} />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">Create {defaultSection}</h3>
          <div className="w-full sm:w-64">
            <ProjectSelect value={projectId} onChange={setProjectId} projects={projectOptions} />
          </div>
        </div>
      )}

      {defaultSection === "memory" ? (
        <div className="space-y-4">
          {studioMode ? (
            <Card className="shadow-panel">
              <CardHeader>
                <CardTitle className="text-base">Add durable memory</CardTitle>
                <CardDescription>
                  Agent-ready context with type, importance, tags, and project scope.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-6">
                <div className="space-y-2 lg:col-span-2">
                  <Label>Title</Label>
                  <Input
                    value={memoryTitle}
                    onChange={(e) => setMemoryTitle(e.target.value)}
                    placeholder="Preferred deployment workflow"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={memoryType}
                    onChange={(e) => setMemoryType(e.target.value as MemoryType)}
                  >
                    {MEMORY_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Importance</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={importance}
                    onChange={(e) => setImportance(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label>Tags</Label>
                  <Input
                    value={memoryTags}
                    onChange={(e) => setMemoryTags(e.target.value)}
                    placeholder="deployment, zeabur, production"
                  />
                </div>
                <div className="space-y-2 lg:col-span-6">
                  <Label>Memory</Label>
                  <Textarea
                    rows={4}
                    value={memoryContent}
                    onChange={(e) => setMemoryContent(e.target.value)}
                    placeholder="What should agents remember and reuse?"
                  />
                </div>
                <div className="space-y-2 lg:col-span-6">
                  <Label htmlFor="memory-file">Attach a file</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      ref={memoryFileRef}
                      id="memory-file"
                      type="file"
                      className="max-w-xl"
                      onChange={(event) => setMemoryFile(event.target.files?.[0] ?? null)}
                    />
                    <span className="text-xs text-muted-foreground">Private · max 10 MB</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:col-span-6">
                  <Button
                    disabled={
                      (!memoryFile && (!memoryTitle.trim() || !memoryContent.trim())) ||
                      memoryMutation.isPending
                    }
                    onClick={() => memoryMutation.mutate()}
                  >
                    {memoryMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Save memory
                  </Button>
                  <Button
                    variant="outline"
                    disabled={dedupeMemoryMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove exact duplicate memories in this scope? The newest copy is kept.",
                        )
                      ) {
                        dedupeMemoryMutation.mutate();
                      }
                    }}
                  >
                    {dedupeMemoryMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CopyX className="size-4" />
                    )}
                    Remove duplicates
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {!studioMode ? (
            <>
              <div className="relative max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search memory title, content, and tags…"
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {memories.isLoading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : visibleMemories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No memories found in this scope.</p>
                ) : (
                  visibleMemories.map((item) => (
                    <Card key={item.id} className="p-4 shadow-panel">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.title}</p>
                            <Badge variant="secondary">{item.memory_type}</Badge>
                            <Badge variant="outline">importance {item.importance}</Badge>
                            <Badge variant="outline">
                              {item.project_id
                                ? (projectNames.get(item.project_id) ?? "Assigned project")
                                : "Personal"}
                            </Badge>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {item.content}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {(item.tags ?? []).map((tag: string) => (
                              <Badge key={tag} variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          {!projectId ? <AddContextToProject kind="memory" id={item.id} /> : null}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={item.pinned ? "Unpin memory" : "Pin memory"}
                            onClick={() =>
                              pinMutation.mutate({ id: item.id, pinned: !item.pinned })
                            }
                          >
                            {item.pinned ? (
                              <PinOff className="size-4" />
                            ) : (
                              <Pin className="size-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete memory"
                            onClick={() => deleteMutation.mutate(item.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {studioMode ? (
            <Card className="shadow-panel">
              <CardHeader>
                <CardTitle className="text-base">Add knowledge</CardTitle>
                <CardDescription>
                  Create searchable notes now; document ingestion and embeddings can attach to the
                  same record lifecycle.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-6">
                <div className="space-y-2 lg:col-span-2">
                  <Label>Title</Label>
                  <Input
                    value={knowledgeTitle}
                    onChange={(e) => setKnowledgeTitle(e.target.value)}
                    placeholder="Open-Connect deployment runbook"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as KnowledgeSourceType)}
                  >
                    {SOURCE_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label>Source URL</Label>
                  <Input
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <Input
                    value={knowledgeTags}
                    onChange={(e) => setKnowledgeTags(e.target.value)}
                    placeholder="runbook, infra"
                  />
                </div>
                <div className="space-y-2 lg:col-span-6">
                  <Label>Content</Label>
                  <Textarea
                    rows={6}
                    value={knowledgeContent}
                    onChange={(e) => setKnowledgeContent(e.target.value)}
                    placeholder="Paste or write reusable knowledge…"
                  />
                </div>
                <div className="space-y-2 lg:col-span-6">
                  <Label htmlFor="knowledge-file">Upload a knowledge file</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      ref={knowledgeFileRef}
                      id="knowledge-file"
                      type="file"
                      className="max-w-xl"
                      onChange={(event) => setKnowledgeFile(event.target.files?.[0] ?? null)}
                    />
                    <span className="text-xs text-muted-foreground">Private · max 10 MB</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:col-span-6">
                  <Button
                    disabled={
                      (!knowledgeFile && (!knowledgeTitle.trim() || !knowledgeContent.trim())) ||
                      knowledgeMutation.isPending
                    }
                    onClick={() => knowledgeMutation.mutate()}
                  >
                    {knowledgeMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Add knowledge
                  </Button>
                  <Button
                    variant="outline"
                    disabled={dedupeKnowledgeMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Archive exact duplicate knowledge items in this scope? The newest copy is kept.",
                        )
                      ) {
                        dedupeKnowledgeMutation.mutate();
                      }
                    }}
                  >
                    {dedupeKnowledgeMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CopyX className="size-4" />
                    )}
                    Remove duplicates
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {!studioMode ? (
            <>
              <div className="relative max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title and content…"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => exportKnowledge("json")}>
                  <Download className="size-4" />
                  Export JSON
                </Button>
                <Button variant="outline" onClick={() => exportKnowledge("markdown")}>
                  <Download className="size-4" />
                  Export Markdown
                </Button>
                <Button variant="outline" onClick={() => exportKnowledge("csv")}>
                  <Download className="size-4" />
                  Export CSV
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,.md,.markdown,.txt,.csv"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) importKnowledgeMutation.mutate(file);
                  }}
                />
                <Button
                  variant="outline"
                  disabled={importKnowledgeMutation.isPending}
                  onClick={() => importFileRef.current?.click()}
                >
                  {importKnowledgeMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Import
                </Button>
                <span className="text-xs text-muted-foreground">
                  Import accepts JSON, Markdown, text, and CSV · Exports the current scope and
                  search results
                </span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {knowledge.isLoading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (knowledge.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No knowledge found in this scope.</p>
                ) : (
                  knowledge.data?.map((item) => (
                    <Card key={item.id} className="p-4 shadow-panel">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.title}</p>
                            <Badge variant="secondary">{item.source_type}</Badge>
                            <Badge variant="outline">{item.status}</Badge>
                            <Badge variant="outline">
                              {item.project_id
                                ? (projectNames.get(item.project_id) ?? "Assigned project")
                                : "Personal"}
                            </Badge>
                          </div>
                          <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm text-muted-foreground">
                            {item.content}
                          </p>
                          {item.source_url ? (
                            <a
                              className="mt-2 block truncate text-xs text-primary hover:underline"
                              href={item.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.source_url}
                            </a>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-1">
                            {(item.tags ?? []).map((tag: string) => (
                              <Badge key={tag} variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          {!projectId ? (
                            <AddContextToProject kind="knowledge" id={item.id} />
                          ) : null}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Archive knowledge"
                          onClick={() => archiveMutation.mutate(item.id)}
                        >
                          <Archive className="size-4" />
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
