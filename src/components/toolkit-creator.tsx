import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createToolkit } from "@/lib/toolkits.functions";
import { listLibraryResources } from "@/lib/library.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const capabilities = (library.data ?? []).flatMap((row) =>
    row.resources ? [row.resources] : [],
  );
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
            <Label htmlFor="toolkit-name">Name</Label>
            <Input
              id="toolkit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Support triage kit"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="toolkit-description">Description</Label>
            <Textarea
              id="toolkit-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this Toolkit helps you do"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Capabilities</Label>
            <span className="text-xs text-muted-foreground">
              {selected.length} of {capabilities.length} selected
            </span>
          </div>
          {library.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading your library…
            </p>
          ) : capabilities.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No capabilities in your personal library yet. Publish or add Agents, Skills, Prompts,
              Tools or Guides first.
            </p>
          ) : (
            <Collapsible defaultOpen={capabilities.length <= 8} className="space-y-2">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted/50">
                <span>Choose capabilities</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {capabilities.length} item(s)
                  <ChevronDown className="size-4" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2">
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                  {capabilities.map((item) => {
                    const active = selected.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setSelected((ids) =>
                            active ? ids.filter((id) => id !== item.id) : [...ids, item.id],
                          )
                        }
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                          active ? "border-primary bg-primary/10" : "border-border"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <Badge variant={active ? "default" : "secondary"} className="shrink-0">
                          {item.resource_type}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((id) => {
                const item = capabilities.find((c) => c.id === id);
                if (!item) return null;
                return (
                  <Badge key={id} variant="secondary" className="max-w-full">
                    <span className="truncate">{item.name}</span>
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            className="w-full sm:w-auto"
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Publish Toolkit
          </Button>
          <p className="text-xs text-muted-foreground sm:ml-1">
            Publishing adds the Toolkit to Marketplace and your personal library.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
