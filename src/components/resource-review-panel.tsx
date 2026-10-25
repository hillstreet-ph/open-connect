import { isResourceApproved } from "@/lib/resource-approval";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Loader2, Search, Send, ShieldCheck, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import {
  inspectResourceBatch,
  editReviewMetadata,
  bulkUpdateResourceReview,
  listResourcesForReview,
  updateResourceReview,
} from "@/lib/resource-review.functions";
import { reviewActionLabel, type ReviewAction } from "@/lib/resource-review-bulk";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const BULK_ACTIONS: { action: ReviewAction; icon: typeof ShieldCheck }[] = [
  { action: "verify", icon: ShieldCheck },
  { action: "verify_publish", icon: BadgeCheck },
  { action: "publish", icon: Send },
  { action: "unpublish", icon: ShieldOff },
];

const BULK_DESCRIPTIONS: Record<ReviewAction, string> = {
  verify:
    "Marks the selected resources as verified. Confirm you have checked each source and license.",
  verify_publish:
    "Marks the selected resources as verified and lists them on the Marketplace. Confirm you have checked each source and license.",
  publish: "Lists the selected resources on the Marketplace. Unverified resources are skipped.",
  unpublish: "Removes the selected resources from the Marketplace. Nothing is deleted.",
  unverify: "Removes verification and unpublishes the selected resources.",
};

export function ResourceReviewPanel() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listResourcesForReview);
  const updateFn = useServerFn(updateResourceReview);
  const bulkFn = useServerFn(bulkUpdateResourceReview);
  const inspectFn = useServerFn(inspectResourceBatch),
    editFn = useServerFn(editReviewMetadata);
  const [edit, setEdit] = useState<{
    id: string;
    name: string;
    description: string;
    version: string;
    license: string;
  } | null>(null);
  const inspection = useMutation({
    mutationFn: (ids: string[]) => inspectFn({ data: { ids } }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["resources-review-queue"] });
      toast.info(
        `${r.results.length} resources inspected. Blocked or changed packages require fresh review.`,
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const editor = useMutation({
    mutationFn: async () => {
      if (edit) await editFn({ data: edit });
    },
    onSuccess: () => {
      setEdit(null);
      void queryClient.invalidateQueries({ queryKey: ["resources-review-queue"] });
      toast.success("Metadata updated; verification and publication reset for review");
    },
    onError: (e) => toast.error(e.message),
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<ReviewAction | null>(null);
  const queue = useQuery({
    queryKey: ["resources-review-queue"],
    queryFn: () => listFn({}),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["resources-review-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["marketplace"] });
    void queryClient.invalidateQueries({ queryKey: ["resources-marketplace"] });
  };
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const rows = queue.data ?? [];
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.name, row.slug, row.source, row.resource_type, row.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [queue.data, filter]);
  const visibleIds = useMemo(() => visible.map((row) => row.id), [visible]);
  const selectedIds = useMemo(() => {
    const present = new Set((queue.data ?? []).map((row) => row.id));
    return [...selected].filter((id) => present.has(id));
  }, [selected, queue.data]);
  const visibleSelected = visibleIds.filter((id) => selected.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && visibleSelected === visibleIds.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAllVisible = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const bulk = useMutation({
    mutationFn: (data: { ids: string[]; action: ReviewAction }) => bulkFn({ data }),
    onSuccess: (result) => {
      const skipped = [
        result.skipped_not_verified ? `${result.skipped_not_verified} not approved` : "",
        result.skipped_unchanged ? `${result.skipped_unchanged} already done` : "",
        result.skipped_conflict
          ? `${result.skipped_conflict} changed during review; reload and retry`
          : "",
        result.missing ? `${result.missing} no longer exist` : "",
      ].filter(Boolean);
      toast.success(
        `${reviewActionLabel(result.action)}: ${result.updated} of ${result.requested} updated` +
          (skipped.length ? ` (skipped ${skipped.join(", ")})` : ""),
      );
      setSelected(new Set());
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Bulk review failed"),
    onSettled: () => setPending(null),
  });
  const update = useMutation({
    mutationFn: (data: { id: string; action: ReviewAction }) => updateFn({ data }),
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === "verify_publish"
          ? "Resource verified and published"
          : variables.action === "verify"
            ? "Resource verified"
            : variables.action === "publish"
              ? "Resource published"
              : variables.action === "unverify"
                ? "Verification removed and resource unpublished"
                : "Resource unpublished",
      );
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Resource review failed"),
  });

  if (queue.isLoading) {
    return (
      <div
        className="h-24 animate-pulse rounded-xl border border-border bg-muted/20"
        aria-label="Loading resources for review"
      />
    );
  }

  if (queue.isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm">
          <p role="alert">The review queue could not be loaded.</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void queue.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!queue.data?.length) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground" role="status">
          All resources are verified and published.
        </CardContent>
      </Card>
    );
  }

  const busy = update.isPending || bulk.isPending;

  return (
    <div className="grid gap-3">
      <Card className="sticky top-0 z-10 shadow-panel">
        <CardContent className="grid gap-3 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter by name, type or source"
              aria-label="Filter resources for review"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allVisibleSelected ? true : visibleSelected > 0 ? "indeterminate" : false}
                onCheckedChange={(value) => toggleAllVisible(value === true)}
                disabled={!visibleIds.length || busy}
                aria-label="Select all shown resources"
              />
              Select all ({visibleIds.length})
            </label>
            <span className="text-sm text-muted-foreground" role="status">
              {selectedIds.length} selected of {queue.data.length}
            </span>
            {selectedIds.length ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                disabled={busy}
              >
                <X className="mr-1 size-4" />
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedIds.length || selectedIds.length > 20 || inspection.isPending}
              onClick={() => inspection.mutate(selectedIds)}
            >
              {inspection.isPending ? "Inspecting…" : "Inspect selected (max 20)"}
            </Button>
            {BULK_ACTIONS.map(({ action, icon: Icon }) => (
              <Button
                key={action}
                size="sm"
                variant={action === "unpublish" ? "outline" : "default"}
                disabled={!selectedIds.length || busy}
                onClick={() => setPending(action)}
              >
                {bulk.isPending && bulk.variables?.action === action ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Icon className="mr-2 size-4" />
                )}
                {reviewActionLabel(action)}
                {selectedIds.length ? ` (${selectedIds.length})` : ""}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!edit}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resource metadata</DialogTitle>
            <DialogDescription>
              Saving changes unpublishes this entry and resets verification. Package bytes and prior
              archives are retained.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              {(["name", "description", "version", "license"] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <Label htmlFor={`resource-edit-${field}`}>{field}</Label>
                  <Input
                    id={`resource-edit-${field}`}
                    value={edit[field]}
                    onChange={(e) => setEdit({ ...edit, [field]: e.target.value })}
                  />
                </div>
              ))}
              <Button disabled={editor.isPending} onClick={() => editor.mutate()}>
                Save for review
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending ? reviewActionLabel(pending) : ""} {selectedIds.length} resource
              {selectedIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? BULK_DESCRIPTIONS[pending] : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulk.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulk.isPending}
              onClick={() => {
                if (pending) bulk.mutate({ ids: selectedIds, action: pending });
              }}
            >
              {pending ? reviewActionLabel(pending) : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!visible.length ? (
        <p className="text-sm text-muted-foreground" role="status">
          No resources match this filter.
        </p>
      ) : null}

      {visible.map((resource) => (
        <Card key={resource.id} className="shadow-panel">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <Checkbox
                className="mt-1"
                checked={selected.has(resource.id)}
                onCheckedChange={(value) => toggle(resource.id, value === true)}
                disabled={busy}
                aria-label={`Select ${resource.name}`}
              />
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{resource.name}</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEdit({
                        id: resource.id,
                        name: resource.name,
                        description: resource.description || "",
                        version: resource.version || "1.0.0",
                        license: resource.license || "proprietary",
                      })
                    }
                  >
                    Edit metadata
                  </Button>
                  {(resource.installation_config as { scan_report?: { state?: string } } | null)
                    ?.scan_report?.state && (
                    <Badge variant="outline">
                      {
                        (resource.installation_config as { scan_report: { state: string } })
                          .scan_report.state
                      }
                    </Badge>
                  )}
                  {(resource.installation_config as { scan_report?: unknown } | null)
                    ?.scan_report != null && (
                    <details className="w-full text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Static inspection details</summary>
                      <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded bg-muted p-3">
                        {JSON.stringify(
                          (resource.installation_config as { scan_report: unknown }).scan_report,
                          null,
                          2,
                        )}
                      </pre>
                      <p>
                        Static checks only. Antivirus has not run. Review the source, license and
                        runtime behavior before publishing.
                      </p>
                    </details>
                  )}
                  <Badge variant="secondary" className="uppercase">
                    {resource.resource_type}
                  </Badge>
                  <Badge variant={isResourceApproved(resource) ? "default" : "outline"}>
                    {isResourceApproved(resource) ? "Verified" : "Needs verification"}
                  </Badge>
                  <Badge variant={resource.published ? "default" : "outline"}>
                    {resource.published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {resource.description || "No description"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resource.source || "Source not listed"}
                  {" · "}
                  {resource.license || "License not listed"}
                  {resource.version ? ` · v${resource.version}` : ""}
                </p>
                {resource.source_url || resource.repository_url ? (
                  <div className="flex flex-wrap gap-3 text-sm">
                    {resource.source_url ? (
                      <a
                        className="text-primary underline underline-offset-4"
                        href={resource.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Source
                      </a>
                    ) : null}
                    {resource.repository_url ? (
                      <a
                        className="text-primary underline underline-offset-4"
                        href={resource.repository_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Repository
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant={isResourceApproved(resource) ? "outline" : "default"}
                onClick={() =>
                  update.mutate({
                    id: resource.id,
                    action: isResourceApproved(resource) ? "unverify" : "verify",
                  })
                }
                disabled={busy}
              >
                {update.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : isResourceApproved(resource) ? (
                  <ShieldOff className="mr-2 size-4" />
                ) : (
                  <ShieldCheck className="mr-2 size-4" />
                )}
                {isResourceApproved(resource) ? "Remove verification" : "Verify"}
              </Button>
              <Button
                size="sm"
                variant={resource.published ? "outline" : "default"}
                onClick={() =>
                  update.mutate({
                    id: resource.id,
                    action: resource.published ? "unpublish" : "publish",
                  })
                }
                disabled={busy || (!isResourceApproved(resource) && !resource.published)}
                title={
                  !isResourceApproved(resource) && !resource.published
                    ? "Verify before publishing"
                    : undefined
                }
              >
                {resource.published ? (
                  <ShieldOff className="mr-2 size-4" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                {resource.published ? "Unpublish" : "Publish"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
