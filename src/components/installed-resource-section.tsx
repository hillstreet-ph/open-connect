import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddToProjectButton } from "@/components/add-to-project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listLibraryResources, removeResourceFromLibrary } from "@/lib/library.functions";

type InstalledResourceType = "toolkit" | "memory" | "knowledge";

export function InstalledResourceSection({
  resourceType,
}: {
  resourceType: InstalledResourceType;
}) {
  const queryClient = useQueryClient();
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
      void queryClient.invalidateQueries({ queryKey: ["resource-library", resourceType] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove package"),
  });
  const items = (resources.data ?? []).flatMap((row) => (row.resources ? [row.resources] : []));

  if (!resources.isLoading && items.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={`Installed ${resourceType} packages`}>
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <PackageCheck className="size-4 text-primary" /> Installed packages
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Added from Marketplace or published in Studio. Assign packages to projects without
          creating duplicate copies.
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
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(resource.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
