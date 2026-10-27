import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CommandCodeSetup() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Command Code workspace setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Run the CLI in your connected computer or sandbox terminal with Node.js 22 or newer. These
          instructions do not start a session or install software automatically.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Open your repository in the provider terminal, then install and sign in:
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3">
              <code>{"npm i -g command-code@latest\ncmd login\ncmd"}</code>
            </pre>
          </li>
          <li>
            Connect Open-Connect tools using OAuth:
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3">
              <code>
                {
                  "cmd mcp add --transport http open-connect https://open-connect.site/mcp\ncmd mcp auth open-connect\ncmd mcp list"
                }
              </code>
            </pre>
            <p className="mt-2 text-muted-foreground">
              Complete sign-in in your browser. Use the intended account and project, then verify a
              read action before running commands that change files or services.
            </p>
          </li>
          <li>
            For a Command Code cloud session, connect GitHub in your Command Code account and
            install its GitHub App on the repository. Push the branch you want to use first.
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3">
              <code>
                {
                  "cmd --cloud\ncmd cloud list\ncmd cloud status <session-id>\ncmd cloud stop <session-id>"
                }
              </code>
            </pre>
          </li>
        </ol>
        <p className="text-muted-foreground">
          Command Code cloud sessions run on Command Code infrastructure and require an eligible
          plan and credits. Local unpushed changes are excluded. Review the session’s pull request
          before merging. Its cloud preview and permission features differ from Desktop.
        </p>
        <p className="text-muted-foreground">
          Desktop users can open a project and configure the same MCP URL under Settings → MCP; the
          Desktop runtime is built in. Model provider keys are configured separately under
          Providers. Keep tokens out of commands, chat, and committed configuration.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link className="underline" to="/integrations" search={{ section: "custom-mcp" }}>
            Open MCP integrations
          </Link>
          <a
            className="underline"
            href="https://commandcode.ai/settings"
            target="_blank"
            rel="noreferrer"
          >
            Command Code account
          </a>
          <a
            className="underline"
            href="https://github.com/apps/command-code-ai/installations/new"
            target="_blank"
            rel="noreferrer"
          >
            GitHub App access
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
