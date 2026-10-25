import { useState } from "react";
import { UniversalConnectorDialog } from "./universal-connector-dialog";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
export function UniversalConnectorLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create a connector plugin</CardTitle>
        <CardDescription>
          Configure an HTTP/SSE MCP or OpenAPI API connector, upload a manifest, then prepare a
          reusable plugin from its discovered capabilities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => setOpen(true)}>Add custom MCP</Button>
        <UniversalConnectorDialog open={open} onOpenChange={setOpen} />
      </CardContent>
    </Card>
  );
}
