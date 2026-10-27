import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  ExternalLink,
  Globe,
  HardDrive,
  Loader2,
  MapPin,
  Monitor,
  Pause,
  RotateCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  controlCloudComputer,
  createCloudComputer,
  getCloudComputerSetup,
} from "@/lib/cloud-resources.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Created = {
  name: string;
  url: string;
  username: string;
  password: string;
  savedToVault: boolean;
};

export function CloudComputerManager() {
  const queryClient = useQueryClient();
  const setupFn = useServerFn(getCloudComputerSetup);
  const createFn = useServerFn(createCloudComputer);
  const controlFn = useServerFn(controlCloudComputer);
  const setup = useQuery({ queryKey: ["cloud-computers"], queryFn: () => setupFn(), retry: false });
  const [plan, setPlan] = useState<"standard" | "advanced" | "performance">("standard");
  const [region, setRegion] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const data = setup.data;
  const regions = data?.regions ?? [];
  const selectedRegion =
    region || regions.find((r) => /sin|hkg|tpe|asia/i.test(r.id))?.id || regions[0]?.id || "";
  const selectedPlan = data?.plans.find((p) => p.id === plan);
  const atLimit = (data?.computers.length ?? 0) >= (data?.maxPerUser ?? 1);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          region: selectedRegion,
          plan,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    onSuccess: (result) => {
      setCreated(result);
      toast.success("Cloud Computer is starting. It is usually ready in 1–3 minutes.");
      void queryClient.invalidateQueries({ queryKey: ["cloud-computers"] });
      void queryClient.invalidateQueries({ queryKey: ["credential-secrets"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create"),
  });
  const control = useMutation({
    mutationFn: (input: { id: string; action: "restart" | "suspend" | "delete" }) =>
      controlFn({ data: { ...input, confirm: input.action === "delete" } }),
    onSuccess: (_, input) => {
      toast.success(
        { restart: "Restarting", suspend: "Suspended", delete: "Deleted" }[input.action],
      );
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["cloud-computers"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  const copy = (value: string, label: string) =>
    void navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader className="items-center text-center">
          <Monitor className="h-10 w-10 text-primary" aria-hidden />
          <CardTitle className="font-serif text-3xl">Create a Cloud Computer</CardTitle>
          <CardDescription>
            An always-on Ubuntu desktop you open in the browser, hosted on your Zeabur account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {setup.isLoading && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking Zeabur…
            </p>
          )}
          {setup.isError && (
            <p role="alert" className="text-sm text-destructive">
              {setup.error instanceof Error ? setup.error.message : "Zeabur could not be loaded."}
            </p>
          )}
          {data && !data.configured && (
            <p role="alert" className="rounded-md border p-3 text-sm">
              {data.error}
            </p>
          )}

          <div className="grid grid-cols-2 rounded-full bg-muted p-1 text-sm" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected
              className="rounded-full bg-background py-2"
            >
              Linux
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              disabled
              title="Windows desktops need a VM provider; Zeabur runs Linux containers."
              className="rounded-full py-2 text-muted-foreground"
            >
              Windows · not available
            </button>
          </div>

          <div className="space-y-3" role="radiogroup" aria-label="Plan">
            {(data?.plans ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={plan === item.id}
                onClick={() => setPlan(item.id)}
                className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left ${
                  plan === item.id ? "border-primary ring-1 ring-primary" : ""
                }`}
              >
                <span className="font-serif text-lg font-semibold">{item.label}</span>
                <span className="text-sm text-muted-foreground">
                  {item.vcpu} vCPU · {item.memoryGb} GB
                </span>
              </button>
            ))}
          </div>

          <div className="divide-y rounded-2xl border">
            <div className="flex items-center justify-between gap-3 p-4">
              <Label htmlFor="computer-region" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Location
              </Label>
              <select
                id="computer-region"
                className="max-w-56 rounded-md border bg-background px-2 py-1 text-sm"
                value={selectedRegion}
                disabled={!regions.length}
                onChange={(event) => setRegion(event.target.value)}
              >
                {regions.length === 0 && <option value="">Unavailable</option>}
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || r.id}
                    {r.description ? ` · ${r.description}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between p-4 text-sm">
              <span className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" /> Storage
              </span>
              <span>Persistent volume (Zeabur plan)</span>
            </div>
          </div>

          {selectedPlan && (
            <div className="space-y-2 text-sm">
              <p className="font-semibold">{selectedPlan.label}</p>
              <p className="text-muted-foreground">{selectedPlan.use}</p>
              <dl className="grid grid-cols-2 gap-y-1 border-t pt-3">
                <dt className="text-muted-foreground">vCPU</dt>
                <dd className="text-right">{selectedPlan.vcpu} vCPU</dd>
                <dt className="text-muted-foreground">Memory</dt>
                <dd className="text-right">{selectedPlan.memoryGb} GB RAM</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                Actual CPU and memory follow your Zeabur plan limits; tiers are a sizing guide.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/50 p-3 text-center text-xs">
            <div>
              <p className="font-medium">Ubuntu desktop</p>
              <p className="text-muted-foreground">XFCE · 64-bit</p>
            </div>
            <div>
              <Globe className="mx-auto mb-1 h-4 w-4" aria-hidden />
              <p className="font-medium">HTTPS URL</p>
            </div>
            <div>
              <p className="font-medium">Password sign-in</p>
              <p className="text-muted-foreground">saved to Vault</p>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Monthly total</span>
              <span className="font-semibold">Billed by your Zeabur plan</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              No Open-Connect charge. Suspend or delete anytime.
            </p>
            <Button
              className="mt-4 w-full rounded-full"
              size="lg"
              disabled={
                !data?.configured || !data.admin || atLimit || !selectedRegion || create.isPending
              }
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Cloud Computer
            </Button>
            {data && !data.admin && (
              <p className="mt-2 text-xs text-muted-foreground">
                Only admins and owners can create Cloud Computers.
              </p>
            )}
            {data?.configured && atLimit && (
              <p className="mt-2 text-xs text-muted-foreground">
                Limit reached ({data.maxPerUser} per user). Delete one to create another.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {created && (
        <Card role="status" className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">Sign-in for {created.name}</CardTitle>
            <CardDescription>
              {created.savedToVault
                ? "Saved to your Credentials vault. This password is shown here once."
                : "Copy this now: it could not be saved to your vault."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="break-all">{created.url}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(created.username, "Username")}
              >
                <Copy className="mr-1 h-3 w-3" /> Username
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(created.password, "Password")}
              >
                <Copy className="mr-1 h-3 w-3" /> Password
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Hide
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(data?.computers.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Cloud Computers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data!.computers.map((computer) => (
              <div key={computer.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{computer.name}</span>
                  <Badge variant={computer.status === "RUNNING" ? "default" : "secondary"}>
                    {computer.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {computer.region} · created {new Date(computer.createdAt).toLocaleString()}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {computer.url && (
                    <Button size="sm" asChild>
                      <a href={computer.url} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="mr-1 h-3 w-3" /> Open desktop
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!data!.admin || control.isPending}
                    onClick={() => control.mutate({ id: computer.id, action: "restart" })}
                  >
                    <RotateCw className="mr-1 h-3 w-3" /> Start / restart
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!data!.admin || control.isPending}
                    onClick={() => control.mutate({ id: computer.id, action: "suspend" })}
                  >
                    <Pause className="mr-1 h-3 w-3" /> Suspend
                  </Button>
                  {pendingDelete === computer.id ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={control.isPending}
                      onClick={() => control.mutate({ id: computer.id, action: "delete" })}
                    >
                      Confirm delete (files are lost)
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!data!.admin}
                      onClick={() => setPendingDelete(computer.id)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
