import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BookOpen,
  Bot,
  Database,
  FileText,
  MousePointerClick,
  Search,
  UserRound,
  Wallet,
} from "lucide-react";
import { CloudBrowserConsole } from "@/components/cloud-browser-console";
import { CloudBrowserDatasets } from "@/components/cloud-browser-datasets";
import { CloudBrowserFetch } from "@/components/cloud-browser-fetch";
import { CloudBrowserMonitors } from "@/components/cloud-browser-monitors";
import { CloudBrowserProfilesPanel } from "@/components/cloud-browser-profiles-panel";
import { CloudBrowserResearch } from "@/components/cloud-browser-research";
import { CloudBrowserSearch } from "@/components/cloud-browser-search";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCloudBrowserWallet } from "@/lib/cloud-browser-workspace.functions";
import {
  cloudBrowserSection,
  cloudBrowserSections,
  type CloudBrowserSection,
} from "@/lib/cloud-browser-sections";

const SECTIONS: Record<
  CloudBrowserSection,
  { label: string; icon: typeof Bot; title: string; description: string }
> = {
  agent: {
    label: "Agent",
    icon: Bot,
    title: "Agent",
    description: "Describe a task; the agent drives a real cloud Chrome while you watch it live.",
  },
  browser: {
    label: "Browser",
    icon: MousePointerClick,
    title: "Browser",
    description: "Take direct control of a remote browser session.",
  },
  search: {
    label: "Search",
    icon: Search,
    title: "Search",
    description: "Live web and news results, ready to read.",
  },
  fetch: {
    label: "Fetch",
    icon: FileText,
    title: "Fetch",
    description: "Turn any public page into clean Markdown.",
  },
  research: {
    label: "Research",
    icon: BookOpen,
    title: "Research",
    description: "Source-backed reports for complex questions.",
  },
  monitor: {
    label: "Monitor",
    icon: Activity,
    title: "Monitor",
    description: "Watch a page or topic on a schedule and catch changes.",
  },
  datasets: {
    label: "Datasets",
    icon: Database,
    title: "Datasets",
    description: "Describe a table in one sentence and fill it from the web.",
  },
  profiles: {
    label: "Profiles",
    icon: UserRound,
    title: "Browser profiles",
    description: "Saved sign-ins reused by Agent and Browser tasks.",
  },
};

/**
 * One cloud browser workspace powered by TinyFish, organised like the TinyFish
 * console. Every section uses the signed-in user's own TinyFish connection.
 * `provider` is still accepted so older links resolve; it no longer switches.
 */
export const Route = createFileRoute("/_authenticated/cloud-browser")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: CloudBrowserSection; run?: string; mode?: "direct"; provider?: string } => ({
    ...(search["section"] !== undefined ? { section: cloudBrowserSection(search["section"]) } : {}),
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
    ...(search["mode"] === "direct" ? { mode: "direct" as const } : {}),
    ...(typeof search["provider"] === "string" ? { provider: search["provider"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Cloud Browser — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CloudBrowserPage,
});

function CloudBrowserPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/cloud-browser" });
  const walletFn = useServerFn(getCloudBrowserWallet);
  const wallet = useQuery({
    queryKey: ["cloud-browser-wallet"],
    queryFn: () => walletFn(),
    retry: false,
    staleTime: 60_000,
  });
  // Legacy ?mode=direct links land on the Browser section.
  const section: CloudBrowserSection =
    search.section ?? (search.mode === "direct" ? "browser" : "agent");
  const meta = SECTIONS[section];
  const selectRun = (run: string | undefined) =>
    void navigate({
      search: ({ run: _previous, ...rest }) => (run ? { ...rest, run } : rest),
      replace: true,
    });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cloud Browser</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent, browser, search, fetch, research, monitors and datasets powered by TinyFish, with
            your own account. The same tools are available to Claude and ChatGPT through
            open-connect.site/mcp.
          </p>
        </div>
        {wallet.data?.connected ? (
          <a
            href="https://agent.tinyfish.ai/wallet"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TinyFish wallet balance"
          >
            <Badge variant="outline" className="gap-1.5 py-1">
              <Wallet className="size-3.5" aria-hidden />
              {wallet.data.currency === "USD" ? "$" : `${wallet.data.currency} `}
              {Number(wallet.data.balance).toFixed(2)}
            </Badge>
          </a>
        ) : null}
      </header>

      <Tabs
        value={section}
        onValueChange={(value) =>
          void navigate({
            search: { section: cloudBrowserSection(value) },
            replace: true,
          })
        }
        className="mt-8"
      >
        <TabsList
          aria-label="Cloud Browser sections"
          className="h-auto w-full flex-wrap justify-start gap-2"
        >
          {cloudBrowserSections.map((value) => {
            const Icon = SECTIONS[value].icon;
            return (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon className="size-4" />
                {SECTIONS[value].label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="mt-6 space-y-1">
          <h2 className="text-xl font-semibold">{meta.title}</h2>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>

        <TabsContent value="agent" className="mt-6">
          <CloudBrowserConsole
            key="agent"
            {...(search.run ? { runId: search.run } : {})}
            onSelectRun={selectRun}
          />
        </TabsContent>
        <TabsContent value="browser" className="mt-6">
          <CloudBrowserConsole key="browser" initialMode="direct" onSelectRun={selectRun} />
        </TabsContent>
        <TabsContent value="search" className="mt-6">
          <CloudBrowserSearch />
        </TabsContent>
        <TabsContent value="fetch" className="mt-6">
          <CloudBrowserFetch />
        </TabsContent>
        <TabsContent value="research" className="mt-6">
          <CloudBrowserResearch />
        </TabsContent>
        <TabsContent value="monitor" className="mt-6">
          <CloudBrowserMonitors />
        </TabsContent>
        <TabsContent value="datasets" className="mt-6">
          <CloudBrowserDatasets />
        </TabsContent>
        <TabsContent value="profiles" className="mt-6">
          <CloudBrowserProfilesPanel />
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-sm text-muted-foreground">
        Need a full desktop instead of a browser?{" "}
        <Link to="/cloud-computer" className="underline">
          Open Cloud Computer
        </Link>
        .
      </p>
    </div>
  );
}
