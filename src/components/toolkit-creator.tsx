import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createToolkit } from "@/lib/toolkits.functions";
import { listLibraryResources } from "@/lib/library.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ToolkitCreator() {
  const qc = useQueryClient();
  const create = useServerFn(createToolkit);
  const listLibrary = useServerFn(listLibraryResources);
  const library = useQuery({
    queryKey: ["resource-library", "all"],
    queryFn: () => listLibrary({ data: {} }),
  });
  const catalog = (library.data ?? []).flatMap((row) => (row.resources ? [row.resources] : []));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const mutation = useMutation({
    mutationFn: () =>
      create({ data: { name, description, resourceIds: selected, published: true } }),
    onSuccess: () => {
      toast.success("Toolkit published and added to your library");
      setName("");
      setDescription("");
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ["toolkits"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create toolkit"),
  });

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle className="text-base">Create and publish a Toolkit</CardTitle>
        <CardDescription>
          Bundle capabilities here; the published Toolkit appears on the Toolkits page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Support triage kit"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={1}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Capabilities</Label>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
            {catalog.map((item) => {
              const active = selected.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setSelected((ids) =>
                      active ? ids.filter((id) => id !== item.id) : [...ids, item.id],
                    )
                  }
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${active ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <span>{item.name}</span>
                  <Badge variant={active ? "default" : "secondary"}>{item.resource_type}</Badge>
                </button>
              );
            })}
          </div>
        </div>
        <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}{" "}
          Publish Toolkit
        </Button>
      </CardContent>
    </Card>
  );
}
