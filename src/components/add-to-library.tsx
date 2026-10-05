import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addResourceToLibrary } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";

export function AddToLibraryButton({
  resourceId,
  collectionId,
  alreadyInLibrary = false,
  resourceType,
}: {
  resourceId: string;
  collectionId?: string;
  resourceType?: string;
  alreadyInLibrary?: boolean;
}) {
  const qc = useQueryClient();
  const add = useServerFn(addResourceToLibrary);
  const mutation = useMutation({
    mutationFn: () => add({ data: { resourceId, collectionId: collectionId || undefined } }),
    onSuccess: () => {
      toast.success(
        resourceType === "skill"
          ? "Added to your Library and Skills collection"
          : collectionId
            ? "Added to Library and collection"
            : "Added to your Library",
      );
      void qc.invalidateQueries({ queryKey: ["resource-library"] });
      void qc.invalidateQueries({ queryKey: ["project-resources"] });
      void qc.invalidateQueries({ queryKey: ["resource-collections"] });
      void qc.invalidateQueries({ queryKey: ["resource-project-assignments"] });
      void qc.invalidateQueries({ queryKey: ["resources-marketplace"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add to library"),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={mutation.isPending || alreadyInLibrary}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <Loader2 className="mr-1 size-3.5 animate-spin" />
      ) : (
        <Library className="mr-1 size-3.5" />
      )}
      {alreadyInLibrary ? "In Library" : "Add to Library"}
    </Button>
  );
}
