import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Brain, Building2, Layers3, LibraryBig, PackageOpen } from "lucide-react";
import { ResourceLibraryCard } from "@/components/resource-library-card";
import { ToolkitCreator } from "@/components/toolkit-creator";
import { MemoryKnowledgePage } from "./memory";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Open-Connect" },
      {
        name: "description",
        content: "Create and publish Open-Connect packages, context, and Toolkits.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioPage,
});

const packageTypes = ["AI Agent", "Skill", "Prompt", "Plugin", "Custom MCP", "Tool"];
const publishablePackageTypes = ["agent", "skill", "prompt", "plugin", "mcp", "tool"] as const;

function SectionHeading({
  icon: Icon,
  label,
  title,
  description,
}: {
  icon: typeof PackageOpen;
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{label}</p>
        <h2 className="mt-0.5 text-xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function StudioPage() {
  const { primary, can } = useRoles();
  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/40 text-primary">
            Workspace · Studio
          </Badge>
          <Badge variant="secondary" className="uppercase">
            {roleLabel(primary)}
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Create and publish</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Studio is the single creation workspace. Upload packages, create reusable context, and
          assemble Toolkits here. Manage published items and assign them to projects from their
          sidebar library pages.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href="#packages">
              <PackageOpen className="size-3.5" />
              Packages
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="#context">
              <Brain className="size-3.5" />
              Memory & Knowledge
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="#toolkits">
              <Boxes className="size-3.5" />
              Toolkits
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/projects">
              <Building2 className="size-3.5" />
              Projects
            </Link>
          </Button>
        </div>
      </header>

      <section id="packages" className="scroll-mt-6 space-y-5">
        <SectionHeading
          icon={PackageOpen}
          label="Packages & capabilities"
          title="Upload once, publish once"
          description="One uploader handles every package type. Automatic detection fills the metadata, while the catalog type remains editable before publishing."
        />
        <div className="flex flex-wrap gap-2">
          {packageTypes.map((type) => (
            <Badge key={type} variant="secondary">
              {type}
            </Badge>
          ))}
        </div>
        {can("upload_resources") ? (
          <div className="max-w-3xl">
            <ResourceLibraryCard
              allowedTypes={publishablePackageTypes}
              title="Upload package"
              cardDescription="Agents, skills, prompts, plugins, MCP, and tools publish to Marketplace and enter your personal library. Memory and Knowledge stay private in their Studio section below."
              showResourceList={false}
            />
          </div>
        ) : (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Your role cannot upload packages. Contact an administrator to raise permissions.
            </CardContent>
          </Card>
        )}
      </section>

      <section id="context" className="scroll-mt-6 space-y-5">
        <SectionHeading
          icon={LibraryBig}
          label="Context & data"
          title="Create Memory or Knowledge"
          description="Use one focused form at a time. Memory stores durable instructions and decisions; Knowledge stores reusable documents, sources, and reference material."
        />
        <Tabs defaultValue="memory" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="memory">
              <Brain className="mr-2 size-4" />
              Memory
            </TabsTrigger>
            <TabsTrigger value="knowledge">
              <LibraryBig className="mr-2 size-4" />
              Knowledge
            </TabsTrigger>
          </TabsList>
          <TabsContent value="memory" className="mt-4">
            <MemoryKnowledgePage defaultSection="memory" studioMode />
          </TabsContent>
          <TabsContent value="knowledge" className="mt-4">
            <MemoryKnowledgePage defaultSection="knowledge" studioMode />
          </TabsContent>
        </Tabs>
      </section>

      <section id="toolkits" className="scroll-mt-6 space-y-5">
        <SectionHeading
          icon={Layers3}
          label="Bundles"
          title="Build a Toolkit"
          description="Combine capabilities already in your personal library into one reusable bundle, then publish it for project assignment."
        />
        <div className="max-w-3xl">
          <ToolkitCreator />
        </div>
      </section>

      <Card className="bg-pillar">
        <CardHeader className="p-5">
          <CardTitle className="text-base">Use what you created</CardTitle>
          <CardDescription>
            Open the matching sidebar library to review items, see project assignment badges, and
            add each item to a project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 px-5 pb-5">
          <Button asChild size="sm">
            <Link to="/agents">Agents</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/skills">Skills</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/prompts">Prompts</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/memory">Memory</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/knowledge">Knowledge</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/toolkits">Toolkits</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
