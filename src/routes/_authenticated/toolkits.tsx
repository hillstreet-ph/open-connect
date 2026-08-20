import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createToolkit, deleteToolkit, listToolkits } from "@/lib/toolkits.functions";
import { EXPLORE_TABS, useMarketplace } from "@/routes/explore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/toolkits")({
  head: () => ({
    meta: [
      { title: "Toolkits — Open-Connect" },
      { name: "description", content: "Bundle skills, apps, models, MCP servers and tools into a Toolkit." },
      { property: "og:title", content: "Toolkits — Open-Connect" },
      { property: "og:description", content: "One Toolkit, one key, every capability your agent needs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ToolkitsPage,
});

function ToolkitsPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listToolkits);
  const create = useServerFn(createToolkit);
  const remove = useServerFn(deleteToolkit);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const catalog = useMarketplace();
  const toolkits = useQuery({ queryKey: ["toolkits"], queryFn: () => list({}) });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { name, description, resourceIds: selected } }),
    onSuccess: () => {
      toast.success("Toolkit created");
      setStep(1);
      setName("");
      setDescription("");
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["toolkits"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create toolkit"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Toolkit deleted");
      void queryClient.invalidateQueries({ queryKey: ["toolkits"] });
    },
  });

  const items = (catalog.data ?? []).filter(
    (item) => filter === "all" || item.resource_type === filter,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Toolkits</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        A Toolkit is a first-class bundle of capabilities — skills, apps, models, MCP servers, tools,
        agents and prompts — that an agent can attach with a single Open-Connect key.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="shadow-panel">
          <CardHeader>
            <CardDescription>Step {step} of 3</CardDescription>
            <CardTitle className="text-base">
              {step === 1 ? "Name your Toolkit" : step === 2 ? "Pick capabilities" : "Review and create"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="toolkit-name">Name</Label>
                  <Input
                    id="toolkit-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Support triage kit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toolkit-description">Description</Label>
                  <Textarea
                    id="toolkit-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What this toolkit is for."
                  />
                </div>
                <Button disabled={!name.trim()} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {EXPLORE_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => setFilter(tab.value)}
                      className={cn(
                        "rounded-full border border-border/70 px-3 py-1 text-xs transition-colors",
                        filter === tab.value
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {items.map((item) => {
                    const active = selected.includes(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() =>
                            setSelected((current) =>
                              active ? current.filter((id) => id !== item.id) : [...current, item.id],
                            )
                          }
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            active ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{item.name}</span>
                            <span className="text-xs uppercase text-muted-foreground">
                              {item.resource_type}
                            </span>
                          </span>
                          {active ? <Check className="size-4 text-primary" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button disabled={selected.length === 0} onClick={() => setStep(3)}>
                    Continue ({selected.length})
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4 text-sm">
                  <p className="font-medium">{name}</p>
                  {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {selected.length} capabilities selected
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                    {createMutation.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                    Create Toolkit
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">Your Toolkits</CardTitle>
            <CardDescription>Attach a Toolkit to any agent connection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {toolkits.data?.length ? (
              toolkits.data.map((toolkit) => (
                <div key={toolkit.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{toolkit.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{toolkit.slug}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate(toolkit.id)}
                      aria-label={`Delete ${toolkit.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {toolkit.toolkit_items?.map((item) => (
                      <Badge key={item.id} variant="secondary" className="text-xs">
                        {item.resources?.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No toolkits yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
