import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listProjects } from "@/lib/orgs.functions";
import { addResourceToProject } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";

/** Logged-in control: attach a marketplace resource to a project workspace. */
export function AddToProjectButton({ resourceId }: { resourceId: string }) {
  const qc = useQueryClient();
  const listProj = useServerFn(listProjects);
  const addRes = useServerFn(addResourceToProject);
  const [projectId, setProjectId] = useState("");
  const [open, setOpen] = useState(false);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProj({}),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: () => addRes({ data: { projectId, resourceId } }),
    onSuccess: () => {
      toast.success("Added to project workspace");
      setOpen(false);
      setProjectId("");
      void qc.invalidateQueries({ queryKey: ["project-resources"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add"),
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FolderKanban className="size-3.5" />
        Add to project
      </Button>
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
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={!projectId || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
