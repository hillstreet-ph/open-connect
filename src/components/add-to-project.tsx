import { Badge } from "@/components/ui/badge";

/** Reusable workspace resources no longer require a per-project assignment. */
export function AddToProjectButton({ resourceId }: { resourceId: string }) {
  return (
    <Badge variant="secondary" data-resource-id={resourceId}>
      All projects
    </Badge>
  );
}
