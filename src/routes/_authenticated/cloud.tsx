import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjectCloudConnections } from "@/lib/workspace.functions";
import { useAuth } from "@/hooks/use-auth";
const services = [
  {
    kind: "sandbox",
    to: "/cloud-sandbox",
    title: "Sandbox",
    description: "Isolated code execution and files through a connected sandbox provider.",
  },
  {
    kind: "browser",
    to: "/cloud-browser",
    title: "Cloud Browser",
    description:
      "Autonomous tasks, live browser control and saved profiles, according to provider support.",
  },
  {
    kind: "phone",
    to: "/cloud-phone",
    title: "Cloud Phone",
    description: "Discover and control devices through your connected phone provider.",
  },
  {
    kind: "terminal",
    to: "/cloud-terminal",
    title: "Cloud Terminal",
    description: "Run commands through a connected remote terminal or sandbox worker.",
  },
  {
    kind: "computer",
    to: "/cloud-computer",
    title: "Cloud Computer",
    description: "Desktop automation and screenshots through a connected computer provider.",
  },
] as const;
export const Route = createFileRoute("/_authenticated/cloud")({
  head: () => ({
    meta: [{ title: "Cloud — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudOverview,
});
function CloudOverview() {
  const { user } = useAuth();
  const list = useServerFn(listProjectCloudConnections);
  const connections = useQuery({
    queryKey: ["cloud-overview", user?.id],
    enabled: Boolean(user),
    queryFn: () => list({ data: { projectId: "" } }),
    retry: false,
  });
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Cloud</h1>
        <p className="mt-2 text-muted-foreground">
          Choose an environment, connect its provider and discover the controls available to your
          account.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((service) => (
          <section key={service.kind} className="space-y-3 rounded-lg border p-5">
            <h2 className="font-semibold">{service.title}</h2>
            <p className="text-sm text-muted-foreground">{service.description}</p>
            <p className="text-xs">
              {service.kind === "browser"
                ? "Native browser adapters and connected tools"
                : connections.isError
                  ? "Connection status unavailable"
                  : connections.isLoading
                    ? "Checking connections…"
                    : (connections.data ?? []).some((item) => item.kinds.includes(service.kind))
                      ? "Connections available · discover tools to verify capabilities"
                      : "Provider connection needed"}
            </p>
            <Link to={service.to} className="inline-block rounded-md border px-3 py-2 text-sm">
              Open {service.title}
            </Link>
          </section>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        A saved connection is not a running environment. Creating environments may incur provider
        charges. Stop unused sessions in their provider controls. Credentials and sign-ins remain
        private to each account and provider.
      </p>
      <Link to="/connections" className="text-sm underline">
        Manage provider connections
      </Link>
    </main>
  );
}
