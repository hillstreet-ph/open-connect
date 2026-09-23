import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, FolderKanban, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listProjects } from "@/lib/orgs.functions";
import { addResourceToProject, listResourceProjectAssignments } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Logged-in control: attach a marketplace resource to a project workspace. */
export function AddToProjectButton({ resourceId }: { resourceId: string }) {
  const qc = useQueryClient();
  const listProj = useServerFn(listProjects);
  const addRes = useServerFn(addResourceToProject);
  const listAssignments = useServerFn(listResourceProjectAssignments);
  const [projectId, setProjectId] = useState("");
  const [open, setOpen] = useState(false);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProj({}),
  });
  const assignments = useQuery({
    queryKey: ["resource-project-assignments", resourceId],
    queryFn: () => listAssignments({ data: { resourceId } }),
  });
  const assignedIds = new Set((assignments.data ?? []).map((item) => item.projectId));

  const mut = useMutation({
    mutationFn: () => addRes({ data: { projectId, resourceId } }),
    onSuccess: () => {
      toast.success("Added to project workspace");
      setOpen(false);
      setProjectId("");
      void qc.invalidateQueries({ queryKey: ["project-resources"] });
      void qc.invalidateQueries({ queryKey: ["resource-project-assignments", resourceId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add"),
  });

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <FolderKanban className="size-3.5" />
          Add to project
        </Button>
        {(assignments.data ?? []).map((item) => (
          <Badge key={item.projectId} variant="secondary" className="gap-1 text-[10px]">
            <Check className="size-3" /> {item.name}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-8 max-w-[12rem] rounded-md border border-input bg-background px-2 text-xs"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      >
        <option value="">Select project…</option>
        {(projects.data ?? []).map((p) => (
          <option key={p.id} value={p.id} disabled={assignedIds.has(p.id)}>
            {p.name}
            {assignedIds.has(p.id) ? " — Added" : ""}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={!projectId || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
