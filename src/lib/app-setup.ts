export const MCP_ENDPOINT = "https://open-connect.site/mcp";
export const GATEWAY_ENDPOINT = "https://open-connect.site/v1";
export const SDK_GUIDES = [
  ["TypeScript", "https://github.com/modelcontextprotocol/typescript-sdk"],
  ["Python", "https://github.com/modelcontextprotocol/python-sdk"],
  ["C#", "https://github.com/modelcontextprotocol/csharp-sdk"],
  ["Go", "https://github.com/modelcontextprotocol/go-sdk"],
  ["Rust", "https://github.com/modelcontextprotocol/rust-sdk"],
  ["Ruby", "https://github.com/modelcontextprotocol/ruby-sdk"],
  ["Java", "https://github.com/modelcontextprotocol/java-sdk"],
  ["Swift", "https://github.com/modelcontextprotocol/swift-sdk"],
  ["PHP", "https://github.com/modelcontextprotocol/php-sdk"],
  ["Kotlin", "https://github.com/modelcontextprotocol/kotlin-sdk"],
] as const;
export type SetupTarget = "vscode" | "cursor" | "portable";
export function installConfiguration(target: SetupTarget) {
  if (!["vscode", "cursor", "portable"].includes(target))
    throw new Error("Choose a supported client");
  return {
    filename:
      target === "vscode"
        ? ".vscode/mcp.json"
        : target === "cursor"
          ? ".cursor/mcp.json"
          : ".mcp.json",
    config:
      target === "vscode"
        ? { servers: { "open-connect": { type: "http", url: MCP_ENDPOINT } } }
        : { mcpServers: { "open-connect": { url: MCP_ENDPOINT } } },
  };
}
export function setupIdentity(name: string, connectionId?: string) {
  const title = name.trim();
  if (!title || title.length > 120 || [...title].some((char) => char.charCodeAt(0) < 32))
    throw new Error("Enter an app name up to 120 characters");
  if (/\b(?:sk-[A-Za-z0-9_-]{16,}|oc_live_[A-Za-z0-9_-]{8,}|Bearer\s)/i.test(title))
    throw new Error("Use an app name without credential values");
  if (connectionId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(connectionId))
    throw new Error("Choose a valid app connection");
  const slug =
    "open-connect-" +
    (title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "app");
  return {
    name: title,
    slug,
    connection_id: connectionId || null,
    version: "0.1.0",
    protocol: "2025-11-25",
    sdk: "@modelcontextprotocol/sdk@1.32.1",
    mcp_url: MCP_ENDPOINT,
    gateway_url: GATEWAY_ENDPOINT,
  };
}
export function setupReadiness(status: string, toolCount: number, checkedAt: string | null) {
  if (status !== "connected") return { ready: false, label: "Connection required" };
  if (!checkedAt || !Number.isFinite(Date.parse(checkedAt)))
    return { ready: false, label: "Discovery required" };
  if (!toolCount) return { ready: false, label: "No enabled tools discovered" };
  return { ready: true, label: "Discovery complete · execution not tested" };
}
