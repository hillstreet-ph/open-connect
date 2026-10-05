import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isSharedLibraryRow } from "@/lib/shared-resources";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listLibraryResources, removeResourceFromLibrary } from "@/lib/library.functions";

type InstalledResourceType = "toolkit" | "memory" | "knowledge";

export function InstalledResourceSection({
  resourceType,
  search = "",
}: {
  resourceType: InstalledResourceType;
  search?: string;
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
      void queryClient.invalidateQueries({ queryKey: ["resource-library"] });
      void queryClient.invalidateQueries({ queryKey: ["project-resources"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove package"),
  });
  const items = (resources.data ?? []).flatMap((row) =>
    row.resources &&
    `${row.resources.name} ${row.resources.description ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase().trim())
      ? [
          {
            ...row.resources,
            shared: isSharedLibraryRow(row),
            installed: !row.id.startsWith("owned-"),
          },
        ]
      : [],
  );

  if (resources.isError)
    return (
      <p role="alert">
        Could not load installed packages.{" "}
        <Button variant="link" onClick={() => void resources.refetch()}>
          Retry
        </Button>
      </p>
    );
  if (resources.isLoading) return <p role="status">Loading installed packages…</p>;
  if (items.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={`Installed ${resourceType} packages`}>
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <PackageCheck className="size-4 text-primary" /> Installed packages
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Installed in the HillStreet workspace from Marketplace or published in Studio. Installed
          packages are available across all your projects.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((resource) => (
          <Card key={resource.id} className="shadow-panel">
            <CardHeader className="p-3 pb-1">
              <Badge variant="secondary" className="w-fit text-[10px] uppercase">
                {resource.resource_type}
              </Badge>
              <CardTitle className="text-sm leading-snug">{resource.name}</CardTitle>
              <CardDescription className="line-clamp-2 text-xs">
                {resource.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-1.5 p-3 pt-1">
              <Badge variant="secondary">
                {resource.shared ? "All projects" : "Private context"}
              </Badge>
              {resource.installed ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${resource.name} from library`}
                  disabled={removeMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(`Remove ${resource.name} from the shared workspace library?`)
                    )
                      removeMutation.mutate(resource.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
