import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, FolderKanban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listProjects } from "@/lib/orgs.functions";
import { addContextToProject, listContextProjectAssignments } from "@/lib/memory.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AddContextToProject({ kind, id }: { kind: "memory" | "knowledge"; id: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listProjects);
  const add = useServerFn(addContextToProject);
  const getAssignments = useServerFn(listContextProjectAssignments);
  const [projectId, setProjectId] = useState("");
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => list({}) });
  const assignments = useQuery({
    queryKey: ["context-project-assignments", kind, id],
    queryFn: () => getAssignments({ data: { kind, id } }),
  });
  const assigned = new Set((assignments.data ?? []).map((item) => item.projectId));
  const mutation = useMutation({
    mutationFn: () => add({ data: { kind, id, projectId } }),
    onSuccess: (result) => {
      toast.success(
        result.duplicate ? "Already added to that project" : `Added ${kind} to project`,
      );
      setProjectId("");
      void qc.invalidateQueries({ queryKey: ["context-project-assignments", kind, id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add"),
  });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <FolderKanban className="size-4 text-muted-foreground" />
      <select
        className="h-8 max-w-52 rounded-md border bg-background px-2 text-xs"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      >
        <option value="">Add to project…</option>
        {(projects.data ?? []).map((project) => (
          <option key={project.id} value={project.id} disabled={assigned.has(project.id)}>
            {project.name}
            {assigned.has(project.id) ? " — Added" : ""}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={!projectId || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Add
      </Button>
      {(assignments.data ?? []).map((item) => (
        <Badge key={item.projectId} variant="secondary" className="gap-1 text-[10px]">
          <Check className="size-3" />
          {item.name}
        </Badge>
      ))}
    </div>
  );
}
