import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listLibraryResources, removeResourceFromLibrary } from "@/lib/library.functions";
import { AddToProjectButton } from "@/components/add-to-project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResourceLibraryPage({
  resourceType,
  title,
  description,
}: {
  resourceType: "agent" | "skill" | "prompt";
  title: string;
  description: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listLibraryResources);
  const remove = useServerFn(removeResourceFromLibrary);
  const resources = useQuery({
    queryKey: ["resource-library", resourceType],
    queryFn: () => list({ data: { resourceType } }),
  });
  const removeMutation = useMutation({
    mutationFn: (resourceId: string) => remove({ data: { resourceId } }),
    onSuccess: () => {
      toast.success("Removed from your library");
      void qc.invalidateQueries({ queryKey: ["resource-library", resourceType] });
    },
  });

  const items = (resources.data ?? []).flatMap((row) => (row.resources ? [row.resources] : []));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
          <Boxes className="mr-1 size-3" /> Personal library
        </Badge>
        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Upload and publish new packages in Studio. Add existing packages from Marketplace.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((resource) => (
          <Card key={resource.id} className="shadow-panel">
            <CardHeader className="p-4 pb-2">
              <Badge variant="secondary" className="w-fit text-[10px] uppercase">
                {resource.resource_type}
              </Badge>
              <CardTitle className="text-base">{resource.name}</CardTitle>
              <CardDescription className="line-clamp-2">{resource.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 p-4 pt-2">
              <AddToProjectButton resourceId={resource.id} />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${resource.name} from library`}
                onClick={() => removeMutation.mutate(resource.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!resources.isLoading && items.length === 0 ? (
        <Card className="shadow-panel">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No {title.toLowerCase()} added yet. Upload one in Studio or add one from Marketplace.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
