import { useState } from "react";
import { testMcpConnection } from "@/lib/mcp-connection-test";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function McpConnectionCard({ freshKey }: { freshKey: string | null }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  async function test() {
    setBusy(true);
    setResult("");
    try {
      const checked = await testMcpConnection(freshKey || token);
      setResult(`Connection verified: initialization succeeded and ${checked.toolCount} tools discovered. ChatGPT installation is a separate step.`);
    } catch (error) {
      setResult(error instanceof Error && !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)
        ? error.message : "Could not reach MCP. Check your connection and try again.");
    } finally {
      setBusy(false);
      setToken("");
    }
  }
  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle className="text-base">Connect ChatGPT & MCP clients</CardTitle>
        <CardDescription>Create a key above, test the connection, then configure your client.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>MCP server URL</p>
        <code className="block break-all rounded-md bg-muted p-3">https://open-connect.site/mcp</code>
        <p>For ChatGPT, connect the MCP server using the OAuth sign-in flow. API keys are for clients that support bearer-token authentication.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>In ChatGPT Settings, open Security and login and enable Developer mode if available.</li>
          <li>Open Plugins, select the plus button, and add the MCP server URL above.</li>
          <li>Complete authentication, review the discovered tools, and add the connection to a new conversation.</li>
        </ol>
        <a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer" className="inline-block text-primary underline">ChatGPT connection instructions</a>
        {freshKey ? <p>The test uses your newly created key.</p> : (
          <div className="space-y-2">
            <Label htmlFor="mcp-test-key">API key to test</Label>
            <Input id="mcp-test-key" type="password" autoComplete="off" value={token}
              onChange={(event) => { setToken(event.target.value); setResult(""); }} placeholder="oc_live_…" disabled={busy} />
          </div>
        )}
        <Button onClick={() => void test()} disabled={busy || !(freshKey || token.trim())}>
          {busy ? "Testing connection…" : "Test MCP connection"}
        </Button>
        <p className="text-xs text-muted-foreground">Tests initialization and tool discovery only. The key is sent to this site's MCP endpoint and is not saved by this test.</p>
        <p role="status" aria-live="polite">{result}</p>
      </CardContent>
    </Card>
  );
}
