import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { listResourcesForReview, updateResourceReview } from "@/lib/resource-review.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ReviewAction = "verify" | "unverify" | "publish" | "unpublish";

export function ResourceReviewPanel() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listResourcesForReview);
  const updateFn = useServerFn(updateResourceReview);
  const queue = useQuery({
    queryKey: ["resources-review-queue"],
    queryFn: () => listFn({}),
  });
  const update = useMutation({
    mutationFn: (data: { id: string; action: ReviewAction }) => updateFn({ data }),
    onSuccess: (_, variables) => {
      toast.success(
        variables.action === "verify"
          ? "Resource verified"
          : variables.action === "publish"
            ? "Resource published"
            : variables.action === "unverify"
              ? "Verification removed and resource unpublished"
              : "Resource unpublished",
      );
      void queryClient.invalidateQueries({ queryKey: ["resources-review-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      void queryClient.invalidateQueries({ queryKey: ["resources-marketplace"] });
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

  return (
    <div className="grid gap-3">
      {queue.data.map((resource) => (
        <Card key={resource.id} className="shadow-panel">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{resource.name}</h3>
                <Badge variant="secondary" className="uppercase">
                  {resource.resource_type}
                </Badge>
                <Badge variant={resource.verified ? "default" : "outline"}>
                  {resource.verified ? "Verified" : "Needs verification"}
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
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant={resource.verified ? "outline" : "default"}
                onClick={() =>
                  update.mutate({
                    id: resource.id,
                    action: resource.verified ? "unverify" : "verify",
                  })
                }
                disabled={update.isPending}
              >
                {update.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : resource.verified ? (
                  <ShieldOff className="mr-2 size-4" />
                ) : (
                  <ShieldCheck className="mr-2 size-4" />
                )}
                {resource.verified ? "Remove verification" : "Verify"}
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
                disabled={update.isPending || (!resource.verified && !resource.published)}
                title={!resource.verified && !resource.published ? "Verify before publishing" : undefined}
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
