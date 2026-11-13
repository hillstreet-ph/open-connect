import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookmarkPlus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { STARTER_TEMPLATES, type WorkTemplate } from "@/lib/operations";
import {
  deleteWorkTemplate,
  listWorkTemplates,
  saveWorkTemplate,
} from "@/lib/operation-templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkTemplatePicker({
  kind,
  draft,
  onSelect,
}: {
  kind: WorkTemplate["kind"];
  draft: Pick<WorkTemplate, "title" | "description" | "priority">;
  onSelect: (template: WorkTemplate) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listWorkTemplates);
  const save = useServerFn(saveWorkTemplate);
  const remove = useServerFn(deleteWorkTemplate);
  const [name, setName] = useState("");
  const key = ["work-templates", user?.id];
  const templates = useQuery({ queryKey: key, queryFn: () => list({}), enabled: !!user });
  const saveMutation = useMutation({
    mutationFn: () => save({ data: { ...draft, name, kind } }),
    onSuccess: () => {
      setName("");
      toast.success("Private template saved");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save template"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Could not remove template"),
  });
  return (
    <section
      className="space-y-3 rounded-xl border bg-muted/20 p-4"
      aria-label="Templates and suggestions"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> Start from a template
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a suggestion, customize it, then create. Nothing runs automatically.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {STARTER_TEMPLATES.filter((t) => t.kind === kind).map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => onSelect(t)}
            className="rounded-lg border bg-background p-3 text-left text-sm transition hover:border-primary/60 focus-visible:outline focus-visible:outline-2"
          >
            <span className="font-medium">{t.name}</span>
            <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
              {t.description}
            </span>
          </button>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          My templates · {(templates.data ?? []).filter((t) => t.kind === kind).length}
        </summary>
        <div className="mt-3 space-y-3">
          {templates.isError ? (
            <p role="alert" className="text-sm">
              Saved templates unavailable.{" "}
              <Button variant="link" onClick={() => void templates.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          {(templates.data ?? [])
            .filter((t) => t.kind === kind)
            .map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="min-w-0 flex-1 justify-start truncate"
                  onClick={() => onSelect(t)}
                >
                  {t.name}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete template ${t.name}`}
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(t.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          <div className="space-y-2">
            <Label htmlFor={`${kind}-template-name`}>Save current form as a private template</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={`${kind}-template-name`}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
                className="min-w-0 flex-1"
              />
              <Button
                variant="outline"
                disabled={
                  !name.trim() ||
                  !draft.title.trim() ||
                  (kind === "automation" && !draft.description.trim()) ||
                  saveMutation.isPending
                }
                onClick={() => saveMutation.mutate()}
              >
                <BookmarkPlus className="size-4" /> Save template
              </Button>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
