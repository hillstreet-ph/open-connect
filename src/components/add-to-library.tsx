import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addResourceToLibrary } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";

export function AddToLibraryButton({ resourceId }: { resourceId: string }) {
  const qc = useQueryClient();
  const add = useServerFn(addResourceToLibrary);
  const mutation = useMutation({
    mutationFn: () => add({ data: { resourceId } }),
    onSuccess: () => {
      toast.success("Installed — available across all your projects");
      void qc.invalidateQueries({ queryKey: ["resource-library"] });
      void qc.invalidateQueries({ queryKey: ["project-resources"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add to library"),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <Loader2 className="mr-1 size-3.5 animate-spin" />
      ) : (
        <Library className="mr-1 size-3.5" />
      )}
      Add to library
    </Button>
  );
}
