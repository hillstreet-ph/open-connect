import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, BookOpen, Brain, Loader2, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listProjects } from "@/lib/orgs.functions";
import {
  archiveKnowledge,
  createKnowledge,
  createMemory,
  deleteMemory,
  listKnowledge,
  listMemories,
  setMemoryPinned,
  type KnowledgeSourceType,
  type MemoryType,
} from "@/lib/memory.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

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
}: {
  defaultSection: "memory" | "knowledge";
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

  const memoryMutation = useMutation({
    mutationFn: () =>
      addMemory({
        data: {
          title: memoryTitle,
          content: memoryContent,
          memoryType,
          importance,
          projectId: projectId || undefined,
          tags: memoryTags,
        },
      }),
    onSuccess: () => {
      toast.success("Memory saved");
      setMemoryTitle("");
      setMemoryContent("");
      setMemoryTags("");
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
    mutationFn: () =>
      addKnowledge({
        data: {
          title: knowledgeTitle,
          content: knowledgeContent,
          sourceType,
          sourceUrl: sourceUrl || undefined,
          projectId: projectId || undefined,
          tags: knowledgeTags,
        },
      }),
    onSuccess: () => {
      toast.success("Knowledge added");
      setKnowledgeTitle("");
      setKnowledgeContent("");
      setSourceUrl("");
      setKnowledgeTags("");
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
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
            Records are private to your authenticated identity and can be scoped to each project.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Label className="mb-2 block">Project scope</Label>
          <ProjectSelect value={projectId} onChange={setProjectId} projects={projectOptions} />
        </div>
      </div>

      <Tabs defaultValue={defaultSection} className="space-y-4">
        <TabsList>
          <TabsTrigger value="memory">
            <Brain className="mr-2 size-4" />
            Memory
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="mr-2 size-4" />
            Knowledge
          </TabsTrigger>
        </TabsList>
        <TabsContent value="memory" className="space-y-4">
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
