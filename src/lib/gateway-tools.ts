/**
 * Client-safe catalog of OpenRouter server tools available through the
 * Open-Connect gateway. Served to the AI Gateway page and to the public
 * discovery endpoints so any agent can discover and use them.
 */

export type GatewayTool = {
  id: string;
  name: string;
  group: string;
  detail: string;
};

export const GATEWAY_TOOLS: GatewayTool[] = [
  {
    id: "openrouter:web_search",
    name: "Web Search",
    group: "Search and retrieval",
    detail: "Searches the web for current information.",
  },
  {
    id: "openrouter:web_fetch",
    name: "Web Fetch",
    group: "Search and retrieval",
    detail: "Fetches and extracts content from URLs.",
  },
  {
    id: "openrouter:datetime",
    name: "Datetime",
    group: "Utilities",
    detail: "Gives the model the current date and time.",
  },
  {
    id: "openrouter:image_generation",
    name: "Image Generation",
    group: "Media",
    detail: "Generates images from model-supplied prompts.",
  },
  {
    id: "openrouter:apply_patch",
    name: "Apply Patch",
    group: "Files and editing",
    detail: "Proposes file edits as V4A diff patches (Responses API).",
  },
  {
    id: "openrouter:files",
    name: "Files",
    group: "Files and editing",
    detail: "Reads, writes, edits, and lists text files in your workspace.",
  },
  {
    id: "openrouter:shell",
    name: "Shell",
    group: "Code execution",
    detail: "Hosted shell in a sandboxed container (Responses and Messages APIs).",
  },
  {
    id: "openrouter:bash",
    name: "Bash",
    group: "Code execution",
    detail: "Anthropic-style bash tool with optional sandboxed execution (Messages API).",
  },
  {
    id: "openrouter:fusion",
    name: "Fusion",
    group: "Multi-model",
    detail: "Runs a panel of models plus an analyst over the request.",
  },
  {
    id: "openrouter:advisor",
    name: "Advisor",
    group: "Multi-model",
    detail: "Consults a stronger advisor model mid-generation.",
  },
  {
    id: "openrouter:subagent",
    name: "Subagent",
    group: "Multi-model",
    detail: "Delegates sub-tasks to a smaller, faster worker model.",
  },
  {
    id: "openrouter:tool_search",
    name: "Tool Search",
    group: "Utilities",
    detail: "Loads your own tool definitions on demand (Responses and Messages APIs).",
  },
  {
    id: "openrouter:experimental__search_models",
    name: "Search Models",
    group: "Utilities",
    detail: "Searches the OpenRouter model catalog. Experimental.",
  },
];

export const GATEWAY_TOOLS_USAGE = [
  "curl -sS https://open-connect.site/v1/chat/completions \\",
  '  -H "Authorization: Bearer sk-oc-YOUR_KEY" \\',
  '  -H "Content-Type: application/json" \\',
  "  -d '{",
  '    "model": "open-connect/auto",',
  '    "messages": [{ "role": "user", "content": "Summarize today'"'"'s AI news" }],',
  '    "tools": [{ "type": "openrouter:web_search" }, { "type": "openrouter:datetime" }]',
  "  }'",
].join("\n");
