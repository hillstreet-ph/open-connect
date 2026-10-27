import {
  authenticatedProfile,
  PROFILE_SCHEMA,
  oauthScopeChallenge,
} from "@/lib/mcp-oauth-contract";
import { AGENCY_CATEGORIES, agencyTemplate } from "@/lib/ai-agency";
import { resourceReviewState, isResourceApproved } from "@/lib/resource-approval";
import {
  adminAccess,
  manageResource,
  ResourceManagementError,
} from "@/lib/admin-management.server";
import {
  AUTO_MODE_OUTPUT_SCHEMA,
  AUTO_DISCOVERY_OUTPUT_SCHEMA,
  AUTO_STATUS_OUTPUT_SCHEMA,
  BROWSER_CREDENTIAL_MATCH_OUTPUT_SCHEMA,
} from "@/lib/auto-mcp-contract";
import type { Json } from "@/integrations/supabase/types";
import { matchBrowserCredentials } from "@/lib/browser-credential-matching";
import { autoInstructions, readAutoMode, writeAutoMode } from "@/lib/auto-mode.server";
import { saveRunLearning } from "@/lib/agent-learning.server";
import { createHash } from "node:crypto";
import {
  redactContext,
  validateTeamInput,
  runFreeAgentTeam,
  requestTeamWorker,
} from "@/lib/agent-team";
import { COMMAND_CENTER_HTML } from "@/lib/command-center";
import {
  CLOUD_BROWSER_FRAME_DOMAINS,
  CLOUD_BROWSER_WIDGET_HTML,
  CLOUD_BROWSER_LEGACY_WIDGET_URI,
  CLOUD_BROWSER_WIDGET_URI,
} from "@/lib/cloud-browser-widget";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  type AuthedKey,
} from "@/lib/gateway.server";
import {
  buildAdaptivePlan,
  isOpaqueCredentialReference,
  rankCapabilities,
  discoverPluginCapabilities,
  PLUGIN_CAPABILITY_TYPES,
  redactEvidence,
} from "@/lib/autonomous-control";
import { streamableMcpResponse } from "@/lib/mcp-transport.server";
import { calculateExpression } from "@/lib/calculator";
import { hasRole, type AppRole } from "@/lib/rbac";
import {
  isRemoteMcpProvider,
  normalizeRemoteMcpAuthType,
  normalizeRemoteMcpEndpoint,
  type RemoteMcpProvider,
} from "@/lib/remote-mcp";

const WWW_AUTH =
  'Bearer realm="open-connect", resource_metadata="https://open-connect.site/.well-known/oauth-protected-resource"';

function normalizeConnectionProvider(value: unknown) {
  const provider = String(value ?? "")
    .trim()
    .toLowerCase();
  return provider === "hubstaff" || provider === "hubstaff-admin" ? "hubstaff_admin" : provider;
}

const CATALOG_TTL_MS = 45_000;
const MODEL_ALIASES = [
  { id: "open-connect/auto-free", upstream: "openrouter/free" },
  { id: "open-connect/fast", upstream: "openai/gpt-4o-mini" },
  { id: "open-connect/balanced", upstream: "openai/gpt-4o-mini" },
  { id: "open-connect/reasoning", upstream: "openai/gpt-4o" },
  { id: "open-connect/coding", upstream: "openai/gpt-4o" },
  { id: "open-connect/vision", upstream: "openai/gpt-4o" },
] as const;

type ResourceRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  resource_type: string;
  installation_type: string | null;
  installation_config: Record<string, unknown> | null;
  verified: boolean;
};

function reviewState(resource: ResourceRow) {
  return resourceReviewState(resource);
}

function isExecutable(resource: ResourceRow) {
  return isResourceApproved(resource);
}

type McpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  _meta?: Record<string, unknown>;
};

const COMMAND_CENTER_URI = "ui://open-connect/command-center-v7.html";
const V6_COMMAND_CENTER_URI = "ui://open-connect/command-center-v6.html";
const V5_COMMAND_CENTER_URI = "ui://open-connect/command-center-v5.html";
const V4_COMMAND_CENTER_URI = "ui://open-connect/command-center-v4.html";
const V3_COMMAND_CENTER_URI = "ui://open-connect/command-center-v3.html";
const V2_COMMAND_CENTER_URI = "ui://open-connect/command-center-v2.html";
const LEGACY_COMMAND_CENTER_URI = "ui://open-connect/command-center-v1.html";
const WIDGET_META = {
  ui: { resourceUri: CLOUD_BROWSER_WIDGET_URI, visibility: ["model", "app"] },
  "ui/resourceUri": CLOUD_BROWSER_WIDGET_URI,
  "openai/outputTemplate": CLOUD_BROWSER_WIDGET_URI,
  "openai/widgetAccessible": true,
  "openai/toolInvocation/invoking": "Opening cloud browser…",
  "openai/toolInvocation/invoked": "Cloud browser ready",
};

/** Isolate-level cache (Cloudflare warm isolates reuse this). */
let catalogCache: {
  at: number;
  tools: McpTool[];
  bySlug: Map<string, ResourceRow>;
  byId: Map<string, ResourceRow>;
  byToolName: Map<string, ResourceRow>;
  count: number;
} | null = null;

const PLATFORM_TOOLS: McpTool[] = [
  {
    name: "get_profile",
    description:
      "Return the immutable profile represented by the validated request credentials. Stable across refresh and reconnection.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: PROFILE_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { "openai/profile": true },
  },
  {
    name: "get_admin_access",
    description:
      "Report actual administrator role, key scopes and management capability limits. Does not change grants.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_owned_resource",
    description:
      "Read one owned resource including its current revision for a subsequent edit. Personal keys only.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_credential_management",
    description:
      "Return the authenticated Secrets screen for creating, retrieving, editing and deleting credential values. This does not perform the operation or return secrets.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "create_resource",
    description:
      "Create a private, unverified resource owned by the authenticated administrator. Supports tools, toolkits, skills and other library types. Requires Admin, control:write and resources:write with a personal key.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          maxLength: 120,
        },
        description: {
          type: "string",
          maxLength: 4000,
        },
        version: {
          type: "string",
          maxLength: 40,
        },
        license: {
          type: "string",
          maxLength: 80,
        },
        slug: {
          type: "string",
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          maxLength: 80,
        },
        resource_type: {
          type: "string",
          enum: [
            "skill",
            "mcp",
            "tool",
            "plugin",
            "agent",
            "prompt",
            "guide",
            "app",
            "model",
            "toolkit",
            "memory",
            "knowledge",
          ],
        },
      },
      required: ["name", "slug", "resource_type"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_resource",
    description:
      "Edit owned resource metadata using its current revision. Editing resets security review and unpublishes the resource. Requires Admin, control:write and resources:write with a personal key.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
        expected_updated_at: {
          type: "string",
          description: "Exact updated_at from get_owned_resource or the last successful write.",
        },
        name: {
          type: "string",
          maxLength: 120,
        },
        description: {
          type: "string",
          maxLength: 4000,
        },
        version: {
          type: "string",
          maxLength: 40,
        },
        license: {
          type: "string",
          maxLength: 80,
        },
      },
      required: ["id", "expected_updated_at"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "upload_resource_content",
    description:
      "Upload up to 256 KiB of Markdown, JSON or text into an owned resource. Replaces the current package, resets review and unpublishes. Never upload credentials. ZIP files use signed-in Studio. Requires Admin, control:write and resources:write with a personal key.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
        expected_updated_at: {
          type: "string",
          description: "Exact updated_at from get_owned_resource or the last successful write.",
        },
        filename: {
          type: "string",
        },
        content: {
          type: "string",
        },
      },
      required: ["id", "expected_updated_at", "filename", "content"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "set_resource_publication",
    description:
      "Publish or unpublish one owned resource after explicit authorization. Publishing requires prior independent security verification. Requires Admin, control:write and resources:write with a personal key.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
        expected_updated_at: {
          type: "string",
          description: "Exact updated_at from get_owned_resource or the last successful write.",
        },
        published: {
          type: "boolean",
        },
        confirm: {
          type: "boolean",
        },
      },
      required: ["id", "expected_updated_at", "published", "confirm"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "search",
    description:
      "Use this when searching Open-Connect projects, providers, plugins, skills, MCP servers, tools, or runs.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "fetch",
    description: "Use this when retrieving one Open-Connect catalog item by its exact id or slug.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "open_connect_status",
    description:
      "Autonomous-Agents Team card: Resources, Connections, Credentials, AI Gateway, and granted key scopes",
    outputSchema: AUTO_STATUS_OUTPUT_SCHEMA,
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: {
      ui: { resourceUri: COMMAND_CENTER_URI, visibility: ["model", "app"] },
      "openai/widgetAccessible": true,
      "ui/resourceUri": COMMAND_CENTER_URI,
      "openai/outputTemplate": COMMAND_CENTER_URI,
    },
  },
  {
    name: "get_auto_mode",
    outputSchema: AUTO_MODE_OUTPUT_SCHEMA,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
    description:
      "Read the authenticated account's scoped Auto autonomy and discovery preference. Host approvals remain enforced.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "set_auto_mode",
    outputSchema: AUTO_MODE_OUTPUT_SCHEMA,
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
    description:
      "Save Auto on/off for the authenticated account and key context. Enables task autonomy and discovery, not permission bypass or secret access.",
    inputSchema: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "auto_discover",
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
    outputSchema: AUTO_DISCOVERY_OUTPUT_SCHEMA,
    description:
      "When Auto is enabled and an authorized task needs a capability, discover tools, toolkits, actions, functions, extensions, apps, skills, agents and MCP packages. Distinguishes scope-authorized platform functions from verified Marketplace metadata and returns discovery routes. Use list_connections then list_connection_tools for connected provider schemas. Never executes or reveals credentials.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", minLength: 1, maxLength: 2000 },
        type: { type: "string", enum: [...PLUGIN_CAPABILITY_TYPES], default: "all" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["goal"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "run_agent_team",
    description:
      "Delegate a goal to category specialist teams (development, business, marketing, research, operations, custom) or generic Planner, Builder, and Reviewer workers on connected catalog-verified free models only, with rotation and bounded fallback. Returns proposals, never executes tools or changes data. Requires models:invoke and agents:invoke; personal model credentials are unavailable to bounded keys.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...AGENCY_CATEGORIES] },
        goal: { type: "string", minLength: 1, maxLength: 4000 },
        context: { type: "string", maxLength: 24000 },
      },
      required: ["goal"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ["model", "app"] }, "openai/widgetAccessible": true },
  },
  {
    name: "capture_context_exchange",
    description:
      "Save one explicitly shared, user-authorized prompt and reply through personal Data Controls. Honors automatic memory and draft preferences, redacts common secrets, and detects repeated saved exchanges. Never reads host history or publishes. Requires personal administrator control:write; automatic drafts also require resources:write.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 8000 },
        response: { type: "string", minLength: 1, maxLength: 8000 },
      },
      required: ["prompt", "response"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "save_context_checkpoint",
    description:
      "Save a redacted, resumable conversation summary to owned Memory. Does not compact the host's conversation. Recall with list_my_memory checkpoint_session. Requires administrator control:write; saves only the supplied summary, never passive full history.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", minLength: 1, maxLength: 160 },
        summary: { type: "string", minLength: 1, maxLength: 24000 },
      },
      required: ["session_id", "summary"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "list_resources",
    description:
      "List public Marketplace resources. These are not personal resources until installed.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Filter: skill | mcp | tool | plugin | agent | prompt | toolkit | memory | knowledge | guide",
        },
      },
    },
  },
  {
    name: "list_personal_resources",
    description:
      "List resources owned by or installed into the authenticated user's personal library.",
    inputSchema: {
      type: "object",
      properties: { type: { type: "string" }, project_id: { type: "string" } },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_my_memory",
    description:
      "Read the authenticated user's private Memory library. When project_id is supplied, also include that user's memory explicitly stored in that accessible project. Without project_id, only personal memory is returned. Project-bound keys return only their project records, never personal records.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        checkpoint_session: { type: "string", maxLength: 160 },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_my_knowledge",
    description:
      "Read the authenticated user's private Knowledge library. When project_id is supplied, also include that user's knowledge explicitly stored in that accessible project. Without project_id, only personal knowledge is returned. Project-bound keys return only their project records, never personal records.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        checkpoint_session: { type: "string", maxLength: 160 },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_workspace_projects",
    description: "List workspaces and projects permitted by this API key's organization scope.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_credential_metadata",
    description:
      "List owned credential metadata and availability. Secret values and TOTP seeds are never returned.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "match_browser_credentials",
    outputSchema: BROWSER_CREDENTIAL_MATCH_OUTPUT_SCHEMA,
    description:
      "Match owned password metadata to an exact HTTPS origin and optional account. Returns credential IDs and password/TOTP availability only. Does not reveal secrets, generate codes, inject credentials, or sign in. Use the browser host's secure authentication capability.",
    inputSchema: {
      type: "object",
      properties: {
        origin: { type: "string", maxLength: 500 },
        account: { type: "string", maxLength: 320 },
      },
      required: ["origin"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "calculate",
    description: "Evaluate bounded arithmetic with +, -, *, /, %, ^, and parentheses.",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string", maxLength: 240 } },
      required: ["expression"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_connections",
    description: "List connected apps (capability grants only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_models",
    description: "List open-connect model aliases on /v1",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "inspect_connections",
    description:
      "Use this when validating connection health, scopes, and opaque credential bindings.",
    inputSchema: {
      type: "object",
      properties: { provider: { type: "string" } },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "list_connection_tools",
    description:
      "Discover schemas from one accessible direct MCP, native provider, or active owned Composio connection.",
    inputSchema: {
      type: "object",
      properties: { connection_id: { type: "string" } },
      required: ["connection_id"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "call_connection_tool",
    description:
      "Call a tool on one accessible direct MCP, native provider, or active owned Composio connection. Twilio writes require admin access. Custom MCP writes require connections:invoke and either a project-scoped key or a personal administrator key with control:write; destructive tools also require confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        connection_id: { type: "string" },
        tool_name: { type: "string" },
        arguments: { type: "object", additionalProperties: true },
        confirm: { type: "boolean" },
      },
      required: ["connection_id", "tool_name"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "cloud_browser_tools",
    description:
      "List supported Playwright browser actions and their argument schemas. One engine, isolated session per authenticated user. No alternate browser fallback.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "cloud_browser_cancel_task",
    description:
      "Stop the caller's active Playwright task, close its browser session, and reject further actions from the cancelled task. Earlier completed actions are not undone.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "cloud_browser_call",
    description:
      "Execute a discovered Playwright browser action in your isolated session. Discover cloud_browser_tools first. Use browser_close when finished. Requires a personal administrator key with tools:invoke and connections:invoke. Never put passwords in arguments.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        arguments: { type: "object", additionalProperties: true },
      },
      required: ["name", "arguments"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "e2b_health",
    description: "Check whether the configured E2B sandbox API is reachable.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "e2b_list_sandboxes",
    description: "List running or paused E2B sandboxes for the connected team.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "e2b_create_sandbox",
    description: "Create an isolated E2B sandbox. Admin and tools:invoke are required.",
    inputSchema: {
      type: "object",
      properties: {
        template: {
          type: "string",
          description: "E2B template id or alias; defaults to base.",
        },
        timeout: { type: "integer", minimum: 30, maximum: 3600 },
        metadata: { type: "object", additionalProperties: { type: "string" } },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "e2b_kill_sandbox",
    description:
      "Terminate one E2B sandbox. Requires explicit confirm=true and admin write access.",
    inputSchema: {
      type: "object",
      properties: {
        sandbox_id: { type: "string" },
        confirm: {
          type: "boolean",
          description: "Must be true to terminate the sandbox.",
        },
      },
      required: ["sandbox_id", "confirm"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "hubstaff_admin_identity",
    description: "Validate the configured Hubstaff Admin identity and granted account access.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "hubstaff_admin_list_organizations",
    description: "List Hubstaff organizations available to the configured administrator.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "hubstaff_admin_request",
    description:
      "Call an authorized Hubstaff v2 endpoint. Writes require admin access; DELETE also requires confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        },
        path: {
          type: "string",
          description: "Hubstaff v2 path beginning with /v2/.",
        },
        body: { type: "object", additionalProperties: true },
        confirm: {
          type: "boolean",
          description: "Required for DELETE requests.",
        },
      },
      required: ["method", "path"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "plan_goal",
    description:
      "Use this when converting an operator goal into a bounded autonomous execution plan.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        environment: {
          type: "string",
          enum: ["development", "staging", "production"],
        },
      },
      required: ["goal"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "execute_plan",
    description:
      "Use this when starting an autonomous plan. Safe reversible steps run automatically; protected steps create an approval request.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        environment: {
          type: "string",
          enum: ["development", "staging", "production"],
        },
      },
      required: ["goal"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "list_control_approvals",
    description:
      "Inspect your own approval requests, including their exact target and expiry. Does not expose other users' requests.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "decide_control_approval",
    description:
      "Record an explicit decision on your own pending, unexpired approval. Requires a personal admin key and confirm=true. Records authorization without starting execution.",
    inputSchema: {
      type: "object",
      properties: {
        approval_id: { type: "string" },
        decision: { type: "string", enum: ["approved", "denied"] },
        confirm: { type: "boolean" },
      },
      required: ["approval_id", "decision", "confirm"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "recommend_toolchain",
    description:
      "Find the smallest approved plugin, skill, tool, app, or MCP bundle matching a goal.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["goal"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "resolve_capability",
    description:
      "Resolve one requested capability to approved catalog resources and report whether a draft is needed.",
    inputSchema: {
      type: "object",
      properties: { capability: { type: "string" } },
      required: ["capability"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "create_capability_draft",
    description:
      "Create a non-executable capability specification when no approved tool exists. It never installs code automatically.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string" },
        goal: { type: "string" },
        environment: {
          type: "string",
          enum: ["development", "staging", "production"],
        },
      },
      required: ["capability", "goal"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "record_run_outcome",
    description:
      "Record a verified autonomous-run outcome, save redacted working memory, promote repeated successes to knowledge, and prepare a private Studio draft when resources:write is granted. For Data Controls activity and suggestions, supply evidence.verified=true only after independently checking the result. Never publishes automatically.",
    inputSchema: {
      type: "object",
      properties: {
        correlation_id: { type: "string" },
        status: { type: "string", enum: ["succeeded", "failed", "blocked"] },
        summary: { type: "string" },
        capability_slugs: { type: "array", items: { type: "string" } },
        evidence: {
          type: "object",
          description:
            "Sanitized result checks. Set verified:true only after checking successful execution; Data Controls ignores unverified learned events.",
        },
      },
      required: ["correlation_id", "status", "summary"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "install_capability",
    description:
      "Request installation of an approved capability as admin. Returns unsupported until a verified provider executor is available.",
    inputSchema: {
      type: "object",
      properties: {
        resource_id: { type: "string" },
        environment: {
          type: "string",
          enum: ["development", "staging", "production"],
        },
      },
      required: ["resource_id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "preview_composio_sync",
    description:
      "Preview owned ACTIVE Composio accounts missing from the personal connector library. Read-only; never imports accounts or assigns project access.",
    inputSchema: {
      type: "object",
      properties: {
        external_account_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description:
            "Optional exact configured Composio external account ID. Returns a redacted account-specific mapping without broker account IDs or credential references.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "sync_composio_accounts",
    description:
      "Import only explicitly selected, currently owned ACTIVE Composio accounts from preview_composio_sync into the personal connector library. Metadata only: does not expand provider scopes or assign project access. Requires a personal administrator key with control:write, connections:invoke, and confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        account_ids: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { type: "string", minLength: 1, maxLength: 256 },
        },
        confirm: { type: "boolean" },
      },
      required: ["account_ids", "confirm"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "repair_connection",
    description:
      "Inspect, validate or repair one exact owned MCP connection. Personal administrators only. API keys stay in Vault; validation must pass before an optimistic update. Never creates or deletes connections.",
    inputSchema: {
      type: "object",
      properties: {
        connection_id: { type: "string", format: "uuid" },
        action: { type: "string", enum: ["inspect", "validate", "apply"] },
        expected_updated_at: { type: "string" },
        credential_id: { type: "string", format: "uuid" },
        endpoint_url: { type: "string", format: "uri" },
        auth_type: { type: "string", enum: ["none", "bearer", "api_key", "personal_access_token"] },
      },
      required: ["connection_id", "action"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "configure_connection",
    description:
      "Use this when binding a provider through an opaque credential:// reference; raw secret values are rejected.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        display_name: { type: "string" },
        credential_ref: { type: "string" },
        scopes: { type: "array", items: { type: "string" } },
        telegram_destination: {
          type: "object",
          properties: {
            chat_id: { type: "string", description: "Numeric Telegram supergroup ID" },
            message_thread_id: { type: "integer", minimum: 1 },
          },
          required: ["chat_id", "message_thread_id"],
          additionalProperties: false,
        },
        endpoint_url: { type: "string", format: "uri" },
        auth_type: {
          type: "string",
          enum: ["none", "bearer", "api_key", "personal_access_token"],
        },
      },
      required: ["provider", "credential_ref"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

async function loadRoles(userId: string): Promise<AppRole[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((row: { role: AppRole }) => row.role);
}

async function loadAuthorizedOrganizationIds(key: AuthedKey): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", key.userId);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.organization_id);
  if (!key.organizationId) return ids;
  return ids.includes(key.organizationId) ? [key.organizationId] : [];
}

async function assertProjectAccess(key: AuthedKey, projectId: string) {
  const organizationIds = await loadAuthorizedOrganizationIds(key);
  if (!organizationIds.length) throw new Error("Project is unavailable to this API key.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: project, error } = await supabaseAdmin
    .from("projects")
    .select("id,organization_id,workspace_id")
    .eq("id", projectId)
    .in("organization_id", organizationIds)
    .maybeSingle();
  if (error || !project) throw new Error("Project is unavailable to this API key.");
  if (key.workspaceId && project.workspace_id !== key.workspaceId) {
    throw new Error("Project is outside this API key's workspace scope.");
  }
  if (key.projectId && project.id !== key.projectId) {
    throw new Error("Project is outside this API key's project scope.");
  }

  const [membership, organizationAdmin] = await Promise.all([
    supabaseAdmin
      .from("project_members")
      .select("id")
      .eq("project_id", project.id)
      .eq("user_id", key.userId)
      .maybeSingle(),
    supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("organization_id", project.organization_id)
      .eq("user_id", key.userId)
      .eq("role", "admin")
      .maybeSingle(),
  ]);
  if (
    membership.error ||
    organizationAdmin.error ||
    (!membership.data && !organizationAdmin.data)
  ) {
    throw new Error("Project is unavailable to this API key.");
  }
  return project;
}

/** A project key may use only connections deliberately assigned to that project. */
async function requireProjectConnectionGrant(key: AuthedKey, connectionId: string) {
  if (!key.projectId) return;
  await assertProjectAccess(key, key.projectId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: grant, error } = await supabaseAdmin
    .from("project_connections")
    .select("id")
    .eq("project_id", key.projectId)
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error || !grant) throw new Error("Connection is not assigned to this API key's project.");
}

async function requireControlWrite(key: AuthedKey) {
  const roles = await loadRoles(key.userId);
  const authorizedRole = hasRole(roles, "admin");
  const authorizedScope = hasScope(key, "control:write");
  if (!authorizedRole || !authorizedScope)
    throw new Error("Admin role and control write scope required.");
  return roles;
}

// Provider writes retain their advertised invoke scopes; control-plane mutations
// require the distinct control:write grant above.
async function requireProviderWrite(key: AuthedKey) {
  const roles = await loadRoles(key.userId);
  if (
    !hasRole(roles, "admin") ||
    !(hasScope(key, "tools:invoke") || hasScope(key, "connections:invoke"))
  )
    throw new Error("Admin role and provider invoke scope required.");
  return roles;
}

function unauthorized(message: string) {
  return new Response(
    JSON.stringify({
      error: { message, type: "open_connect_error", code: "invalid_api_key" },
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": WWW_AUTH,
        "access-control-allow-origin": "*",
      },
    },
  );
}

function scopeDenied(id: unknown, message: string, scope: string) {
  const challenge = oauthScopeChallenge(scope);
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      result: {
        ...textResult({ error: { message, code: "insufficient_scope" } }),
        isError: true,
        _meta: { "mcp/www_authenticate": [challenge] },
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    },
  );
}

/** Compact JSON (no pretty-print) — smaller responses, faster serialize. */
function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

function executionUnavailable(operation: "invoke" | "install", resource: ResourceRow) {
  return {
    ...textResult({
      status: "unsupported",
      code: "provider_executor_unavailable",
      operation,
      resource: {
        slug: resource.slug,
        name: resource.name,
        type: resource.resource_type,
      },
      execution: {
        verified: false,
        performed: false,
        message:
          "No verified provider executor is configured for this capability. Catalog approval and connection metadata do not prove execution.",
      },
    }),
    isError: true,
  };
}

function toolNameFromSlug(slug: string) {
  return `resource_${slug.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
}

function toolTitle(name: string) {
  return name
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function chatGptTools() {
  // Marketplace resources are intentionally accessed through list_resources,
  // search, and fetch. Publishing every catalog row as another MCP tool creates
  // duplicate capabilities and makes ChatGPT's plugin scan brittle.
  // Discovery describes capabilities; execution still enforces token scopes and roles.
  // Hiding write tools here prevents clients from discovering their OAuth requirements.
  return PLATFORM_TOOLS.map((tool) => {
    const securitySchemes = [
      {
        type: "oauth2",
        scopes: requiredToolScopes(tool.name),
      },
    ];
    return {
      ...tool,
      title: tool.title ?? toolTitle(tool.name),
      securitySchemes,
      _meta: { ...tool._meta, securitySchemes },
    };
  });
}

async function getCatalog(force = false) {
  const now = Date.now();
  if (!force && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache;
  }

  const { oauthDatabase } = await import("@/lib/oauth-client.server");
  const rows: ResourceRow[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await oauthDatabase()
      .from("resources")
      .select(
        "id, slug, name, description, resource_type, installation_type, installation_config, verified",
      )
      .eq("published", true)
      .order("featured", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Resource catalog unavailable");
    rows.push(...((data ?? []) as ResourceRow[]));
    if ((data?.length ?? 0) < pageSize) break;
  }
  const bySlug = new Map<string, ResourceRow>();
  const byId = new Map<string, ResourceRow>();
  const byToolName = new Map<string, ResourceRow>();
  const resourceTools: McpTool[] = [];

  for (const r of rows) {
    bySlug.set(r.slug, r);
    byId.set(r.id, r);
    if (isExecutable(r)) {
      const tn = toolNameFromSlug(r.slug);
      byToolName.set(tn, r);
      resourceTools.push({
        name: tn,
        description: `[${r.resource_type}] ${r.name}${r.description ? ` — ${r.description.slice(0, 160)}` : ""}`,
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", description: "info | invoke" },
          },
        },
      });
    }
  }

  catalogCache = {
    at: now,
    tools: [...PLATFORM_TOOLS, ...resourceTools],
    bySlug,
    byId,
    byToolName,
    count: rows.length,
  };
  return catalogCache;
}

async function findResourceByToolName(toolName: string): Promise<ResourceRow | null> {
  const catalog = await getCatalog();
  const hit = catalog.byToolName.get(toolName);
  if (hit) return hit;

  // Fallback: direct DB by normalized slug (cache miss / race)
  const raw = toolName.replace(/^resource_/, "");
  const slugHyphen = raw.replace(/_/g, "-");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("resources")
    .select(
      "id, slug, name, description, resource_type, installation_type, installation_config, verified",
    )
    .eq("published", true)
    .or(`slug.eq.${slugHyphen},slug.eq.${raw}`)
    .limit(1)
    .maybeSingle();
  return (data as ResourceRow | null) ?? null;
}

function fireLog(key: AuthedKey, statusCode: number) {
  void logGatewayRequest({
    key,
    endpoint: "/mcp",
    statusCode,
    upstream: "open-connect",
  });
}

const RESOURCE_WRITE_TOOLS = [
  "create_resource",
  "update_resource",
  "upload_resource_content",
  "set_resource_publication",
];

const TOOL_SCOPES: Record<string, string> = {
  get_admin_access: "mcp:connect",
  get_owned_resource: "resources:read",
  get_credential_management: "secrets:read",
  create_resource: "resources:write",
  update_resource: "resources:write",
  upload_resource_content: "resources:write",
  set_resource_publication: "resources:write",
  search: "resources:read",
  fetch: "resources:read",
  open_connect_status: "mcp:connect",
  get_auto_mode: "mcp:connect",
  set_auto_mode: "tools:invoke",
  auto_discover: "resources:read",
  list_resources: "resources:read",
  list_personal_resources: "resources:read",
  list_my_memory: "memory:read",
  list_my_knowledge: "knowledge:read",
  list_workspace_projects: "resources:read",
  list_credential_metadata: "secrets:read",
  match_browser_credentials: "secrets:read",
  calculate: "mcp:connect",
  list_connections: "connections:read",
  preview_composio_sync: "connections:read",
  list_models: "models:read",
  inspect_connections: "connections:read",
  list_connection_tools: "connections:read",
  call_connection_tool: "connections:invoke",
  cloud_browser_tools: "connections:read",
  cloud_browser_call: "tools:invoke",
  cloud_browser_cancel_task: "tools:invoke",
  e2b_health: "connections:read",
  e2b_list_sandboxes: "connections:read",
  e2b_create_sandbox: "tools:invoke",
  e2b_kill_sandbox: "tools:invoke",
  hubstaff_admin_identity: "connections:read",
  hubstaff_admin_list_organizations: "connections:read",
  hubstaff_admin_request: "tools:invoke",
  plan_goal: "resources:read",
  recommend_toolchain: "resources:read",
  resolve_capability: "resources:read",
  execute_plan: "control:write",
  list_control_approvals: "resources:read",
  decide_control_approval: "control:write",
  create_capability_draft: "control:write",
  record_run_outcome: "control:write",
  run_agent_team: "models:invoke",
  save_context_checkpoint: "control:write",
  capture_context_exchange: "control:write",
  repair_connection: "control:write",
  configure_connection: "control:write",
  sync_composio_accounts: "control:write",
  install_capability: "control:write",
};

function requiredToolScopes(name: string): string[] {
  if (name === "get_profile") return [];
  return [
    ...new Set([
      TOOL_SCOPES[name] ?? "tools:invoke",
      ...(name === "run_agent_team" ? ["agents:invoke"] : []),
      ...(name === "sync_composio_accounts" ? ["connections:invoke"] : []),
      ...(name === "repair_connection" ? ["connections:invoke", "secrets:read"] : []),
      ...(RESOURCE_WRITE_TOOLS.includes(name) ? ["control:write"] : []),
    ]),
  ];
}
function canUseTool(key: AuthedKey, toolName: string) {
  return requiredToolScopes(toolName).every((scope) => hasScope(key, scope));
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return unauthorized("Missing or invalid Open-Connect key.");
        if (request.headers.get("accept")?.includes("text/event-stream")) {
          return new Response(null, {
            status: 405,
            headers: { allow: "POST", "cache-control": "no-store" },
          });
        }
        return json({
          name: "open-connect",
          version: "1.0.2",
          protocol: "mcp",
          planes: ["resources", "connections", "models", "credentials"],
          endpoints: {
            mcp: "https://open-connect.site/mcp",
            models: "https://open-connect.site/v1",
            api: "https://open-connect.site/api/v1",
            oauth: "https://open-connect.site/.well-known/oauth-authorization-server",
          },
          authenticated: true,
          user_id: key.userId,
          scopes: key.scopes,
          context: {
            organization_id: key.organizationId,
            workspace_id: key.workspaceId,
            project_id: key.projectId,
            access_profile: key.accessProfile,
          },
        });
      },
      POST: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return unauthorized("Missing or invalid Open-Connect key.");
        if (
          !hasScope(key, "mcp:connect") &&
          !hasScope(key, "control:write") &&
          !hasScope(key, "models:read") &&
          !hasScope(key, "models:invoke") &&
          !hasScope(key, "resources:read") &&
          !hasScope(key, "memory:read") &&
          !hasScope(key, "knowledge:read") &&
          !hasScope(key, "tools:invoke")
        ) {
          return gatewayError("Key is missing an accepted MCP scope.", 403, "insufficient_scope");
        }

        const body = (await request.json().catch(() => null)) as {
          jsonrpc?: string;
          id?: string | number;
          method?: string;
          params?: {
            name?: string;
            arguments?: Record<string, unknown>;
            protocolVersion?: string;
          };
        } | null;

        if (!body?.method) {
          return gatewayError("JSON-RPC method required.", 400, "invalid_request");
        }

        let result: Record<string, unknown>;

        if (body.method === "initialize") {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const auto = await readAutoMode(supabaseAdmin as SupabaseClient, key);
          result = {
            protocolVersion: body.params?.protocolVersion ?? "2025-06-18",
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
            },
            serverInfo: {
              name: "open-connect",
              version: "1.0.2",
              planes: ["resources", "connections", "models", "credentials"],
            },
            instructions: autoInstructions(auto.enabled),
          };
        } else if (body.method === "tools/list") {
          result = { tools: chatGptTools() };
        } else if (body.method === "resources/list") {
          result = {
            resources: [
              {
                uri: COMMAND_CENTER_URI,
                name: "Open-Connect Autonomous-Agents Team",
                description: "Autonomous control status and execution view",
                mimeType: "text/html;profile=mcp-app",
              },
              {
                uri: CLOUD_BROWSER_WIDGET_URI,
                name: "Open-Connect Cloud Browser",
                description: "Live view of a cloud browser run",
                mimeType: "text/html;profile=mcp-app",
              },
            ],
          };
        } else if (body.method === "resources/read") {
          const uri = (body.params as { uri?: string } | undefined)?.uri;
          result =
            uri === COMMAND_CENTER_URI ||
            uri === V6_COMMAND_CENTER_URI ||
            uri === V5_COMMAND_CENTER_URI ||
            uri === V4_COMMAND_CENTER_URI ||
            uri === V3_COMMAND_CENTER_URI ||
            uri === V2_COMMAND_CENTER_URI ||
            uri === LEGACY_COMMAND_CENTER_URI
              ? {
                  contents: [
                    {
                      uri: COMMAND_CENTER_URI,
                      mimeType: "text/html;profile=mcp-app",
                      text: COMMAND_CENTER_HTML,
                      _meta: {
                        ui: {
                          domain: "https://open-connect.site",
                          prefersBorder: true,
                          csp: {
                            connectDomains: ["https://open-connect.site"],
                            resourceDomains: [],
                          },
                        },
                        "openai/widgetDescription":
                          "Open-Connect Autonomous-Agents Team: Auto and four scoped capability planes",
                      },
                    },
                  ],
                }
              : uri === CLOUD_BROWSER_WIDGET_URI || uri === CLOUD_BROWSER_LEGACY_WIDGET_URI
                ? {
                    contents: [
                      {
                        uri,
                        mimeType: "text/html;profile=mcp-app",
                        text: CLOUD_BROWSER_WIDGET_HTML,
                        _meta: {
                          ui: {
                            domain: "https://open-connect.site",
                            prefersBorder: true,
                            csp: {
                              connectDomains: ["https://open-connect.site"],
                              resourceDomains: [],
                              frameDomains: CLOUD_BROWSER_FRAME_DOMAINS,
                            },
                          },
                          "openai/widgetCSP": {
                            connect_domains: ["https://open-connect.site"],
                            resource_domains: [],
                            frame_domains: CLOUD_BROWSER_FRAME_DOMAINS,
                          },
                          "openai/widgetDescription":
                            "Live cloud browser view with status, steps and result",
                        },
                      },
                    ],
                  }
                : { contents: [] };
        } else if (body.method === "tools/call") {
          const name = body.params?.name;
          const args = body.params?.arguments ?? {};
          // Self-guarded provider writes retain their invoke grants. Control-plane
          // tools must report missing scope before their role/data guards throw.
          if (
            name &&
            (TOOL_SCOPES[name] === "control:write" || RESOURCE_WRITE_TOOLS.includes(name)) &&
            !hasScope(key, "control:write")
          ) {
            return scopeDenied(
              body.id,
              `Key requires control:write to invoke ${name}.`,
              requiredToolScopes(name).join(" "),
            );
          }

          if (!name || !canUseTool(key, name)) {
            return scopeDenied(
              body.id,
              `Key cannot invoke ${name || "this tool"} in its selected scope.`,
              requiredToolScopes(name ?? "").join(" "),
            );
          }

          if (name === "get_profile") {
            const profile = authenticatedProfile(key.userId);
            result = { ...textResult(profile), structuredContent: profile };
          } else if (name === "get_admin_access") {
            result = textResult(adminAccess(key, hasRole(await loadRoles(key.userId), "admin")));
          } else if (name === "get_credential_management") {
            if (key.projectId || key.workspaceId || key.organizationId)
              return gatewayError(
                "Credential management requires a personal context.",
                403,
                "insufficient_scope",
              );
            result = textResult({
              url: "https://open-connect.site/secrets",
              actions: ["create", "reveal", "update", "delete"],
              authentication_required: true,
              operation_performed: false,
              secret_values_exposed: false,
              secure_injection_available: false,
            });
          } else if (name === "get_owned_resource") {
            if (key.projectId || key.workspaceId || key.organizationId)
              return gatewayError(
                "Owned resource reads require a personal context.",
                403,
                "insufficient_scope",
              );
            if (typeof args["id"] !== "string" || !/^[0-9a-f-]{36}$/i.test(args["id"]))
              return gatewayError("Invalid resource id.", 400, "invalid_request");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin
              .from("resources")
              .select(
                "id,slug,name,description,resource_type,version,license,published,verified,package_filename,package_size,updated_at",
              )
              .eq("id", args["id"])
              .eq("owner_id", key.userId)
              .maybeSingle();
            if (error || !data) return gatewayError("Owned resource not found.", 404, "not_found");
            result = textResult({ resource: data });
          } else if (
            [
              "create_resource",
              "update_resource",
              "upload_resource_content",
              "set_resource_publication",
            ].includes(name)
          ) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            try {
              result = textResult(
                await manageResource(
                  supabaseAdmin as SupabaseClient,
                  key,
                  hasRole(await loadRoles(key.userId), "admin"),
                  name,
                  args,
                ),
              );
              catalogCache = null;
            } catch (error) {
              result = {
                ...textResult({
                  error: {
                    code: "resource_management_error",
                    message:
                      error instanceof ResourceManagementError
                        ? error.message
                        : "Resource management is temporarily unavailable.",
                  },
                }),
                isError: true,
              };
            }
          } else if (name === "search") {
            const query = String(args["query"] ?? "").trim();
            const catalog = await getCatalog();
            const ranked = rankCapabilities(
              query,
              [...catalog.bySlug.values()].map((item) => ({
                slug: item.slug,
                name: item.name,
                description: item.description,
                resourceType: item.resource_type,
                installationType: item.installation_type,
              })),
              10,
            );
            const results = ranked.map((item) => ({
              id: item.slug,
              title: item.name,
              url: `https://open-connect.site/resources?resource=${encodeURIComponent(item.slug)}`,
              score: item.score,
              matched_terms: item.matchedTerms,
            }));
            result = textResult({ results });
          } else if (name === "fetch") {
            const id = String(args["id"] ?? "").trim();
            const catalog = await getCatalog();
            const item = catalog.bySlug.get(id) ?? catalog.byId.get(id);
            result = textResult(
              item
                ? {
                    id: item.slug,
                    title: item.name,
                    text: item.description ?? "",
                    url: `https://open-connect.site/resources?resource=${encodeURIComponent(item.slug)}`,
                    metadata: {
                      type: item.resource_type,
                      installation_type: item.installation_type,
                      review_state: reviewState(item),
                      risk: item.installation_config?.["risk"] ?? null,
                      canonical_url: item.installation_config?.["canonical_url"] ?? null,
                      executable: isExecutable(item),
                    },
                  }
                : {
                    id,
                    title: "Not found",
                    text: "No matching Open-Connect resource.",
                    url: "https://open-connect.site/resources",
                  },
            );
          } else if (name === "open_connect_status") {
            const catalog = await getCatalog();
            let connections: number | null = null;
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              if (
                hasScope(key, "connections:read") &&
                !key.organizationId &&
                !key.workspaceId &&
                !key.projectId
              ) {
                const response = await supabaseAdmin
                  .from("app_connections")
                  .select("id", { count: "exact", head: true })
                  .eq("user_id", key.userId)
                  .eq("status", "connected");
                if (!response.error && typeof response.count === "number")
                  connections = response.count;
              }
            } catch {
              // Status must remain available even when the optional connection counter is not.
            }
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const personal = !key.projectId && !key.workspaceId && !key.organizationId;
            const canReadCredentials = personal && hasScope(key, "secrets:read");
            const canReadModels =
              personal && (hasScope(key, "models:read") || hasScope(key, "models:invoke"));
            const [credentials, models] = await Promise.all([
              (async () => {
                if (!canReadCredentials) return null;
                try {
                  const response = await supabaseAdmin
                    .from("credential_secrets")
                    .select("id", { count: "exact", head: true })
                    .eq("user_id", key.userId);
                  return !response.error && typeof response.count === "number"
                    ? response.count
                    : null;
                } catch {
                  return null;
                }
              })(),
              (async () => {
                if (!canReadModels) return null;
                try {
                  const { resolveUserUpstreams, fetchMergedModelCatalog } =
                    await import("@/lib/gateway.server");
                  const catalog = await fetchMergedModelCatalog(
                    await resolveUserUpstreams(key.userId, false),
                  );
                  return catalog.ids.length;
                } catch {
                  return null;
                }
              })(),
            ]);
            const auto = await readAutoMode(supabaseAdmin as SupabaseClient, key);
            const status = {
              auto,
              gateway: "open-connect.site",
              planes: {
                resources: { published: catalog.count },
                connections: {
                  connected: connections,
                  available: connections !== null,
                },
                credentials: {
                  available: canReadCredentials,
                  count: credentials,
                  mode: "metadata_only",
                },
                models: {
                  count: models,
                  available: canReadModels,
                  endpoint: "https://open-connect.site/v1",
                  aliases: MODEL_ALIASES.map((a) => a.id),
                },
              },
              scopes: key.scopes,
              user_id: key.userId,
            };
            result = { ...textResult(status), structuredContent: status };
          } else if (
            name === "get_auto_mode" ||
            name === "set_auto_mode" ||
            name === "auto_discover"
          ) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const auto =
              name === "set_auto_mode"
                ? await writeAutoMode(supabaseAdmin as SupabaseClient, key, args["enabled"])
                : await readAutoMode(supabaseAdmin as SupabaseClient, key);
            let payload: Record<string, unknown> = {
              auto,
              instructions: autoInstructions(auto.enabled),
            };
            if (name === "auto_discover") {
              const goal = String(args["goal"] ?? "").trim();
              if (!goal || goal.length > 2000)
                return gatewayError("goal must contain 1–2000 characters", 400, "invalid_request");
              const requestedLimit = Number(args["limit"] ?? 5);
              const limit = Number.isFinite(requestedLimit)
                ? Math.min(10, Math.max(1, Math.trunc(requestedLimit)))
                : 5;
              const catalog = auto.enabled === true ? await getCatalog() : null;
              const matches = catalog
                ? discoverPluginCapabilities(
                    goal,
                    [
                      ...[...catalog.bySlug.values()].filter(isExecutable).map((item) => ({
                        slug: item.slug,
                        name: item.name,
                        description: item.description,
                        resourceType: item.resource_type,
                        installationType: item.installation_type,
                      })),
                      ...PLATFORM_TOOLS.filter(
                        (tool) => tool.name !== "auto_discover" && canUseTool(key, tool.name),
                      ).map((tool) => ({
                        slug: tool.name,
                        name: toolTitle(tool.name),
                        description: tool.description,
                        resourceType: "function",
                        installationType: "mcp-tool",
                      })),
                    ],
                    new Set(
                      PLATFORM_TOOLS.filter((tool) => canUseTool(key, tool.name)).map(
                        (tool) => tool.name,
                      ),
                    ),
                    String(args["type"] ?? "all"),
                    limit,
                  )
                : [];
              payload = {
                ...payload,
                goal,
                matches,
                execution_performed: false,
                values_exposed: false,
                status: !auto.available
                  ? "unavailable"
                  : !auto.enabled
                    ? "disabled"
                    : matches.length
                      ? "matched"
                      : "no_match",
                next_action: matches.length
                  ? "Inspect matched metadata, then discover the actual host or connection tool schema and verify authorized access."
                  : "Use an existing host tool or report the missing capability; do not assume a catalog entry is executable.",
              };
            }
            result = { ...textResult(payload), structuredContent: payload };
          } else if (name === "calculate") {
            const expression = String(args["expression"] ?? "");
            result = textResult({
              expression,
              result: calculateExpression(expression),
            });
          } else if (name === "list_workspace_projects") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const organizationIds = await loadAuthorizedOrganizationIds(key);
            if (!organizationIds.length) {
              result = textResult({ workspaces: [], projects: [] });
            } else {
              let workspaceQuery = supabaseAdmin
                .from("workspaces")
                .select("id,organization_id,name,slug,description")
                .in("organization_id", organizationIds)
                .order("name");
              let projectQuery = supabaseAdmin
                .from("projects")
                .select("id,organization_id,workspace_id,name,slug,description")
                .in("organization_id", organizationIds)
                .order("name");
              if (key.workspaceId) {
                workspaceQuery = workspaceQuery.eq("id", key.workspaceId);
                projectQuery = projectQuery.eq("workspace_id", key.workspaceId);
              }
              if (key.projectId) projectQuery = projectQuery.eq("id", key.projectId);
              const [workspaces, projects] = await Promise.all([workspaceQuery, projectQuery]);
              if (workspaces.error) throw new Error(workspaces.error.message);
              if (projects.error) throw new Error(projects.error.message);
              const [
                { data: assignedProjects, error: assignedError },
                { data: adminMemberships, error: adminError },
              ] = await Promise.all([
                supabaseAdmin
                  .from("project_members")
                  .select("project_id")
                  .eq("user_id", key.userId),
                supabaseAdmin
                  .from("organization_members")
                  .select("organization_id")
                  .eq("user_id", key.userId)
                  .eq("role", "admin")
                  .in("organization_id", organizationIds),
              ]);
              if (assignedError) throw new Error(assignedError.message);
              if (adminError) throw new Error(adminError.message);
              const assignedIds = new Set((assignedProjects ?? []).map((row) => row.project_id));
              const adminOrganizationIds = new Set(
                (adminMemberships ?? []).map((row) => row.organization_id),
              );
              const visibleProjects = (projects.data ?? []).filter(
                (project) =>
                  assignedIds.has(project.id) || adminOrganizationIds.has(project.organization_id),
              );
              result = textResult({
                workspaces: workspaces.data ?? [],
                projects: visibleProjects,
              });
            }
          } else if (name === "match_browser_credentials") {
            if (key.projectId || key.workspaceId || key.organizationId)
              return gatewayError(
                "Browser password matching requires a personal credential context.",
                403,
                "insufficient_scope",
              );
            // Validate before accessing the owner's password metadata.
            matchBrowserCredentials([], args["origin"], args["account"]);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin
              .from("credential_secrets")
              .select("id,name,website,username,email_address,vault_secret_id,totp_vault_secret_id")
              .eq("user_id", key.userId)
              .eq("secret_type", "password")
              .order("id")
              .limit(1001);
            if (error) throw new Error("Credential metadata could not be read.");
            if ((data?.length ?? 0) > 1000)
              throw new Error("Too many credential records to establish an unambiguous match.");
            const payload = matchBrowserCredentials(data ?? [], args["origin"], args["account"]);
            result = { ...textResult(payload), structuredContent: payload };
          } else if (name === "list_credential_metadata") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data, error } = await supabaseAdmin
              .from("credential_secrets")
              .select(
                "id,name,secret_type,scopes,website,last_used_at,created_at,updated_at,vault_secret_id,totp_vault_secret_id",
              )
              .eq("user_id", key.userId)
              .order("created_at", { ascending: false });
            if (error) throw new Error(error.message);
            result = textResult({
              credentials: (data ?? []).map((item) => ({
                id: item.id,
                name: item.name,
                type: item.secret_type,
                scopes: item.scopes,
                website: item.website,
                has_secret: Boolean(item.vault_secret_id),
                has_totp: Boolean(item.totp_vault_secret_id),
                last_used_at: item.last_used_at,
                updated_at: item.updated_at,
              })),
              secret_values_exposed: false,
            });
          } else if (name === "list_my_memory" || name === "list_my_knowledge") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const requestedProject = String(args["project_id"] ?? key.projectId ?? "").trim();
            if (key.projectId && requestedProject && requestedProject !== key.projectId) {
              throw new Error("Key is restricted to a different project.");
            }
            if (requestedProject) await assertProjectAccess(key, requestedProject);
            const limit = Math.min(200, Math.max(1, Math.floor(Number(args["limit"]) || 50)));
            const isMemory = name === "list_my_memory";
            const table = isMemory ? "memory_records" : "knowledge_items";
            const select = isMemory
              ? "id,project_id,title,content,memory_type,importance,pinned,tags,expires_at,created_at,updated_at"
              : "id,project_id,title,content,source_type,source_url,status,tags,created_at,updated_at";
            const readRows = async (projectId: string | null) => {
              // Table names and selected columns are fixed above; the API key user id scopes every query.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let query = (supabaseAdmin as any)
                .from(table)
                .select(select)
                .eq("user_id", key.userId)
                .order("updated_at", { ascending: false })
                .limit(limit);
              query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
              if (!isMemory) query = query.neq("status", "archived");
              if (isMemory && typeof args["checkpoint_session"] === "string")
                query = query.eq(
                  "metadata->>checkpoint_session",
                  args["checkpoint_session"].slice(0, 160),
                );
              const { data, error } = await query;
              if (error) throw new Error(error.message);
              return data ?? [];
            };
            const [personal, project] = await Promise.all([
              key.projectId ? Promise.resolve([]) : readRows(null),
              requestedProject ? readRows(requestedProject) : Promise.resolve([]),
            ]);
            result = textResult({
              personal,
              project,
              project_id: requestedProject || null,
              user_owned_only: true,
            });
          } else if (name === "list_personal_resources") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const type = typeof args["type"] === "string" ? args["type"] : "";
            const requestedProject = String(args["project_id"] ?? key.projectId ?? "").trim();
            if (key.projectId && requestedProject && requestedProject !== key.projectId) {
              throw new Error("Key is restricted to a different project.");
            }
            let rows: Array<Record<string, unknown>> = [];
            if (requestedProject) {
              await assertProjectAccess(key, requestedProject);
              const { data, error } = await supabaseAdmin
                .from("project_resources")
                .select("resources(id,slug,name,description,resource_type,version,verified)")
                .eq("project_id", requestedProject);
              if (error) throw new Error(error.message);
              rows = (data ?? []).flatMap((item) => {
                const resource = item.resources as unknown as Record<string, unknown> | null;
                return resource ? [resource] : [];
              });
            }
            const { readWorkspaceLibrary } = await import("@/lib/workspace-library.server");
            const { isSharedLibraryRow } = await import("@/lib/shared-resources");
            const library = await readWorkspaceLibrary({
              supabase: supabaseAdmin,
              userId: key.userId,
            });
            rows.push(
              ...library
                .filter((row) => !requestedProject || isSharedLibraryRow(row))
                .flatMap((row) => (row.resources ? [row.resources] : [])),
            );
            const unique = [
              ...new Map(rows.map((item) => [String(item["id"]), item])).values(),
            ].filter((item) => !type || item["resource_type"] === type);
            result = textResult({
              resources: unique,
              project_id: requestedProject || null,
            });
          } else if (name === "inspect_connections") {
            const provider = normalizeConnectionProvider(args["provider"]);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const owned: Array<{
              id: string;
              provider: string;
              display_name: string | null;
              status: string;
              scopes: string[];
              credential_reference: string | null;
              last_used_at: string | null;
            }> = [];
            if (!key.projectId) {
              for (let offset = 0; ; offset += 200) {
                let query = supabaseAdmin
                  .from("app_connections")
                  .select(
                    "id,provider,display_name,status,scopes,credential_reference,last_used_at",
                  )
                  .eq("user_id", key.userId)
                  .order("id", { ascending: true });
                if (provider) query = query.eq("provider", provider);
                const { data: page, error } = await query.range(offset, offset + 199);
                if (error) throw new Error("Could not inspect owned connections.");
                owned.push(...(page ?? []));
                if ((page?.length ?? 0) < 200) break;
              }
            }
            const visible = new Map<string, Record<string, unknown>>();
            for (const connection of owned ?? []) {
              visible.set(connection.id, {
                id: connection.id,
                provider: connection.provider,
                display_name: connection.display_name,
                status: connection.status,
                scopes: connection.scopes,
                access_scope: "personal",
                credential_reference: connection.credential_reference ? "configured" : "missing",
                last_used_at: connection.last_used_at,
              });
            }
            if (key.projectId) {
              await assertProjectAccess(key, key.projectId);
              const projectDb = supabaseAdmin as SupabaseClient;
              const { data: shared, error: sharedError } = await projectDb
                .from("project_connections")
                .select(
                  "connection_id, app_connections!inner(id,provider,display_name,status,scopes)",
                )
                .eq("project_id", key.projectId);
              if (sharedError) throw new Error(sharedError.message);
              const sharedRows = Array.isArray(shared)
                ? (shared as Array<{
                    connection_id?: string;
                    app_connections?: {
                      id?: string;
                      provider?: string;
                      display_name?: string;
                      status?: string;
                      scopes?: string[];
                    } | null;
                  }>)
                : [];
              for (const row of sharedRows) {
                const connection = row.app_connections;
                if (!connection?.id || (provider && connection.provider !== provider)) continue;
                visible.set(connection.id, {
                  id: connection.id,
                  provider: connection.provider,
                  display_name: connection.display_name,
                  status: connection.status,
                  scopes: connection.scopes,
                  access_scope: "project",
                  credential_reference: "brokered",
                });
              }
            }
            result = textResult({ connections: [...visible.values()] });
          } else if (name === "list_connection_tools") {
            await requireProjectConnectionGrant(key, String(args["connection_id"] ?? ""));
            const { listCustomMcpTools, remoteMcpFailureResult } =
              await import("@/lib/custom-mcp.server");
            try {
              const payload = await listCustomMcpTools(
                key.userId,
                String(args["connection_id"] ?? ""),
                key.projectId ?? undefined,
              );
              result = { ...textResult(payload), structuredContent: payload };
            } catch (error) {
              const failure = remoteMcpFailureResult(error);
              if (!failure) throw error;
              result = { ...textResult(failure), structuredContent: failure, isError: true };
            }
          } else if (name === "call_connection_tool") {
            const { callCustomMcpTool, listCustomMcpTools } =
              await import("@/lib/custom-mcp.server");
            const connectionId = String(args["connection_id"] ?? "");
            await requireProjectConnectionGrant(key, connectionId);
            const toolName = String(args["tool_name"] ?? "");
            const catalog = await listCustomMcpTools(
              key.userId,
              connectionId,
              key.projectId ?? undefined,
            );
            const tool = catalog.tools.find((item) => item["name"] === toolName);
            if (!tool) throw new Error("Connected MCP tool was not found.");
            const annotations = (tool["annotations"] ?? {}) as Record<string, unknown>;
            if (
              annotations["readOnlyHint"] !== true &&
              ["twilio", "telegram"].includes(catalog.connection.provider)
            ) {
              await requireProviderWrite(key);
            } else if (annotations["readOnlyHint"] !== true) {
              if (!key.projectId) {
                if (key.organizationId || key.workspaceId)
                  throw new Error(
                    "Use a personal administrator key or a project-scoped key for connection writes.",
                  );
                // Personal connections are owner-checked by listCustomMcpTools.
                // Explicit administrator grants can invoke them without an artificial project.
                await requireControlWrite(key);
              }
              if (!hasScope(key, "connections:invoke")) {
                throw new Error("Key cannot invoke write-capable connection actions.");
              }
            }
            if (annotations["destructiveHint"] === true && args["confirm"] !== true) {
              throw new Error("Explicit confirm=true is required for destructive tools.");
            }
            const toolArguments =
              args["arguments"] && typeof args["arguments"] === "object"
                ? (args["arguments"] as Record<string, unknown>)
                : {};
            const connectionResult = await callCustomMcpTool(
              key.userId,
              connectionId,
              toolName,
              toolArguments,
              key.projectId ?? undefined,
            );
            result = {
              ...textResult(connectionResult),
              ...(connectionResult.isError ? { isError: true } : {}),
            };
          } else if (name === "cloud_browser_cancel_task") {
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error("Cloud Browser currently requires a personal key.");
            await requireProviderWrite(key);
            const { playwrightTaskControl } = await import("@/lib/playwright-worker.server");
            result = textResult(await playwrightTaskControl(key.userId, "cancel"));
          } else if (name === "cloud_browser_tools" || name === "cloud_browser_call") {
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error("Cloud Browser currently requires a personal key.");
            if (name === "cloud_browser_call") await requireProviderWrite(key);
            const { playwrightWorker } = await import("@/lib/playwright-worker.server");
            const payload = await playwrightWorker(
              key.userId,
              name === "cloud_browser_call" ? String(args["name"] ?? "") : undefined,
              (args["arguments"] ?? {}) as Record<string, unknown>,
            );
            result = {
              ...textResult(payload),
              structuredContent: payload,
              ...(payload.isError ? { isError: true } : {}),
            };
          } else if (name === "e2b_health") {
            const { e2bConfig, e2bHealth } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            result = textResult({
              configured: true,
              reachable: true,
              health: await e2bHealth(),
            });
          } else if (name === "e2b_list_sandboxes") {
            const { e2bConfig, listE2bSandboxes } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            result = textResult(await listE2bSandboxes(Number(args["limit"] ?? 100)));
          } else if (name === "e2b_create_sandbox") {
            await requireProviderWrite(key);
            const { createE2bSandbox, e2bConfig } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            const metadata =
              args["metadata"] && typeof args["metadata"] === "object"
                ? Object.fromEntries(
                    Object.entries(args["metadata"] as Record<string, unknown>)
                      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
                      .slice(0, 20),
                  )
                : {};
            const template = typeof args["template"] === "string" ? args["template"] : null;
            result = textResult(
              await createE2bSandbox({
                ...(template ? { template } : {}),
                timeout: Number(args["timeout"] ?? 300),
                metadata,
              }),
            );
          } else if (name === "e2b_kill_sandbox") {
            await requireProviderWrite(key);
            if (args["confirm"] !== true) throw new Error("Explicit confirm=true is required");
            const { e2bConfig, killE2bSandbox } = await import("@/lib/e2b.server");
            if (!e2bConfig().configured) throw new Error("E2B is not configured");
            result = textResult(await killE2bSandbox(String(args["sandbox_id"] ?? "")));
          } else if (name === "hubstaff_admin_identity") {
            const { hubstaffAdminConfig, hubstaffAdminIdentity } =
              await import("@/lib/hubstaff-admin.server");
            if (!hubstaffAdminConfig().configured)
              throw new Error("Hubstaff Admin is not configured");
            result = textResult(await hubstaffAdminIdentity(key.userId));
          } else if (name === "hubstaff_admin_list_organizations") {
            const { hubstaffAdminConfig, listHubstaffOrganizations } =
              await import("@/lib/hubstaff-admin.server");
            if (!hubstaffAdminConfig().configured)
              throw new Error("Hubstaff Admin is not configured");
            result = textResult(await listHubstaffOrganizations(key.userId));
          } else if (name === "hubstaff_admin_request") {
            const method = String(args["method"] ?? "GET").toUpperCase();
            if (method !== "GET") await requireProviderWrite(key);
            if (method === "DELETE" && args["confirm"] !== true) {
              throw new Error("Explicit confirm=true is required for DELETE");
            }
            const { hubstaffAdminConfig, hubstaffAdminRequest } =
              await import("@/lib/hubstaff-admin.server");
            if (!hubstaffAdminConfig().configured)
              throw new Error("Hubstaff Admin is not configured");
            const body =
              args["body"] && typeof args["body"] === "object"
                ? (args["body"] as Record<string, unknown>)
                : undefined;
            result = textResult(
              await hubstaffAdminRequest(key.userId, {
                method,
                path: String(args["path"] ?? ""),
                ...(body ? { body } : {}),
              }),
            );
          } else if (name === "recommend_toolchain" || name === "resolve_capability") {
            const goal = String(
              name === "resolve_capability" ? args["capability"] : args["goal"],
            ).trim();
            const limit = name === "resolve_capability" ? 5 : Number(args["limit"] ?? 5);
            const catalog = await getCatalog();
            const matches = rankCapabilities(
              goal,
              [...catalog.bySlug.values()].filter(isExecutable).map((item) => ({
                slug: item.slug,
                name: item.name,
                description: item.description,
                resourceType: item.resource_type,
                installationType: item.installation_type,
              })),
              limit,
            );
            result = textResult({
              goal,
              matches,
              missing_capability: matches.length === 0,
              next_action: matches.length ? "install_or_invoke" : "create_capability_draft",
              values_exposed: false,
            });
          } else if (name === "plan_goal") {
            const catalog = await getCatalog();
            result = textResult(
              buildAdaptivePlan(
                String(args["goal"] ?? ""),
                String(args["environment"] ?? "production"),
                [...catalog.bySlug.values()].filter(isExecutable).map((item) => ({
                  slug: item.slug,
                  name: item.name,
                  description: item.description,
                  resourceType: item.resource_type,
                  installationType: item.installation_type,
                })),
              ),
            );
          } else if (name === "list_control_approvals" || name === "decide_control_approval") {
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error("Use a personal API key for personal control approvals.");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const db = supabaseAdmin as import("@supabase/supabase-js").SupabaseClient;
            if (name === "list_control_approvals") {
              const { data, error } = await db
                .from("control_approvals")
                .select(
                  "id,action,target,environment,state,expires_at,parameters_digest,decided_at",
                )
                .eq("tenant_id", key.userId)
                .eq("requested_by", key.userId)
                .order("created_at", { ascending: false })
                .limit(100);
              if (error) throw new Error("Could not read your approval requests.");
              result = textResult({ approvals: data ?? [], execution_started: false });
            } else {
              await requireControlWrite(key);
              const { decideControlApproval } = await import("@/lib/control-approvals.server");
              result = textResult(
                await decideControlApproval(
                  db,
                  key.userId,
                  String(args["approval_id"] ?? ""),
                  String(
                    args["decision"] ?? "",
                  ) as import("@/lib/control-approvals.server").ApprovalDecision,
                  args["confirm"] === true,
                ),
              );
            }
          } else if (name === "execute_plan") {
            await requireControlWrite(key);
            const catalog = await getCatalog();
            const plan = buildAdaptivePlan(
              String(args["goal"] ?? ""),
              String(args["environment"] ?? "production"),
              [...catalog.bySlug.values()].map((item) => ({
                slug: item.slug,
                name: item.name,
                description: item.description,
                resourceType: item.resource_type,
                installationType: item.installation_type,
              })),
            );
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // Generated Supabase types lag new migrations until the next type-generation job.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const controlDb = supabaseAdmin as any;
            const state = plan.approvalRequired ? "approval_required" : "planned";
            await controlDb.from("autonomous_runs").upsert({
              id: plan.id,
              user_id: key.userId,
              goal: plan.goal,
              environment: plan.environment,
              state,
              plan: redactEvidence(plan),
              evidence: {
                verified: false,
                capability_count: plan.capabilities.length,
                values_exposed: false,
              },
              rollback: { available: true },
              correlation_id: plan.id,
            });
            await controlDb.from("autonomous_run_events").insert({
              user_id: key.userId,
              run_id: plan.id,
              event_type: "planned",
              summary: plan.missingCapability
                ? "No approved capability matched; a draft specification was created."
                : `Selected ${plan.capabilities.length} approved capability candidate(s).`,
              capability_slugs: plan.capabilities.map((capability) => capability.slug),
              evidence: { values_exposed: false },
            });
            if (plan.missingCapability) {
              await controlDb.from("capability_requests").insert({
                user_id: key.userId,
                source_run_id: plan.id,
                requested_capability: plan.goal.slice(0, 240),
                goal: plan.goal,
                state: "draft",
                specification: {
                  generated_by: "open-connect",
                  executable: false,
                  required_contract: [
                    "input_schema",
                    "output_schema",
                    "credential_reference",
                    "health_check",
                    "approval_policy",
                    "tests",
                  ],
                },
              });
            }
            let approvalRequest: { id: string; expires_at: string } | null = null;
            if (plan.approvalRequired) {
              const { data: approval, error: approvalError } = await controlDb
                .from("control_approvals")
                .insert({
                  tenant_id: key.userId,
                  requested_by: key.userId,
                  action: "execute_plan",
                  target: plan.goal,
                  environment: plan.environment,
                  risk: "protected",
                  parameters_digest: plan.id,
                  expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
                })
                .select("id,expires_at")
                .single();
              if (approvalError || !approval)
                throw new Error("Could not create the required approval request.");
              approvalRequest = approval;
            }
            result = textResult({
              correlation_id: plan.id,
              state,
              plan,
              approval_request: approvalRequest,
              autonomous_steps_executed: plan.approvalRequired
                ? ["discover"]
                : ["discover", "plan"],
            });
          } else if (name === "run_agent_team") {
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error(
                "Bounded keys cannot use personal model credentials. Use a personal key with models:invoke.",
              );
            const { resolveAutoFreeRoutes, resolveUserUpstreams } =
              await import("@/lib/gateway.server");
            const input = validateTeamInput(args);
            const roles =
              args["category"] !== undefined ? agencyTemplate(args["category"]).roles : undefined;
            const routes = await resolveAutoFreeRoutes(
              await resolveUserUpstreams(key.userId, false),
            );
            result = textResult(await runFreeAgentTeam(routes, input, requestTeamWorker, roles));
          } else if (name === "capture_context_exchange") {
            await requireControlWrite(key);
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error("Shared host capture requires a personal administrator key");
            const { validateSharedExchange, defaultDataControls, validateDataControls } =
              await import("@/lib/data-controls");
            const input = validateSharedExchange(args);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: preferences, error } = await (supabaseAdmin as SupabaseClient)
              .from("data_control_settings")
              .select("capture_activity,save_helper_memory,suggest_drafts,retention_days")
              .eq("user_id", key.userId)
              .maybeSingle();
            if (error) throw new Error("Data Controls preferences could not be read");
            const settings = validateDataControls(preferences ?? defaultDataControls);
            const { captureHelperExchange } = await import("@/lib/data-controls.server");
            const saved = await captureHelperExchange(
              supabaseAdmin as SupabaseClient,
              key.userId,
              input.prompt,
              input.response,
              {
                ...settings,
                suggest_drafts: settings.suggest_drafts && canUseTool(key, "create_resource"),
              },
              "host-shared",
            );
            result = textResult({
              memory_saved: !!saved,
              memory_id: saved?.memory_id ?? null,
              status: saved ? "saved_or_already_present" : "disabled_by_data_controls",
              host_history_read: false,
              published: false,
            });
          } else if (name === "save_context_checkpoint") {
            await requireControlWrite(key);
            if ((key.workspaceId || key.organizationId) && !key.projectId)
              throw new Error("Choose a project-scoped or personal key for Memory checkpoints.");
            if (key.projectId) await assertProjectAccess(key, key.projectId);
            const session = typeof args["session_id"] === "string" ? args["session_id"].trim() : "";
            const summary =
              typeof args["summary"] === "string" ? redactContext(args["summary"].trim()) : "";
            if (
              !session ||
              redactContext(session) !== session ||
              session.length > 160 ||
              !summary ||
              summary.length > 24000
            )
              throw new Error(
                "Supply session_id up to 160 characters and a summary up to 24000 characters.",
              );
            const digest = createHash("sha256")
              .update(JSON.stringify([key.userId, key.projectId, session]))
              .digest("hex");
            const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { error } = await supabaseAdmin.from("memory_records").upsert(
              {
                id,
                user_id: key.userId,
                project_id: key.projectId,
                title: "Agent context checkpoint",
                content: summary,
                memory_type: "summary",
                importance: 4,
                tags: ["context-checkpoint"],
                metadata: {
                  checkpoint_session: session,
                  source: "mcp",
                  scope: key.projectId ?? "personal",
                },
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" },
            );
            if (error) throw new Error("Context checkpoint could not be saved.");
            result = textResult({
              memory_id: id,
              checkpoint_session: session,
              memory_saved: true,
              host_context_compacted: false,
            });
          } else if (name === "create_capability_draft") {
            await requireControlWrite(key);
            const capability = String(args["capability"] ?? "")
              .trim()
              .slice(0, 240);
            const goal = String(args["goal"] ?? "")
              .trim()
              .slice(0, 4_000);
            if (!capability || !goal) throw new Error("Capability and goal are required.");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // Generated Supabase types lag new migrations until the next type-generation job.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const controlDb = supabaseAdmin as any;
            const { data, error } = await controlDb
              .from("capability_requests")
              .insert({
                user_id: key.userId,
                requested_capability: capability,
                goal,
                state: "draft",
                specification: {
                  environment: String(args["environment"] ?? "development"),
                  executable: false,
                  required_contract: [
                    "input_schema",
                    "output_schema",
                    "credential_reference",
                    "health_check",
                    "approval_policy",
                    "tests",
                  ],
                },
              })
              .select("id,requested_capability,state,created_at")
              .single();
            if (error) throw new Error(error.message);
            result = textResult({
              draft: data,
              executable: false,
              values_exposed: false,
            });
          } else if (name === "record_run_outcome") {
            await requireControlWrite(key);
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error(
                "Run learning requires a personal administrator key; bounded keys cannot write personal learning.",
              );

            const correlationId = String(args["correlation_id"] ?? "").trim();
            const status = String(args["status"] ?? "") as "succeeded" | "failed" | "blocked";
            const summary = String(args["summary"] ?? "")
              .trim()
              .slice(0, 50_000);
            const capabilitySlugs = Array.isArray(args["capability_slugs"])
              ? args["capability_slugs"]
                  .filter((value): value is string => typeof value === "string")
                  .slice(0, 20)
              : [];
            if (!correlationId || !["succeeded", "failed", "blocked"].includes(status) || !summary)
              throw new Error("Valid correlation id, status, and summary are required.");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            // Generated Supabase types lag new migrations until the next type-generation job.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const controlDb = supabaseAdmin as any;
            const { data: run } = await controlDb
              .from("autonomous_runs")
              .select("id,goal")
              .eq("correlation_id", correlationId)
              .eq("user_id", key.userId)
              .single();
            if (!run) throw new Error("Autonomous run not found.");
            const saved = await saveRunLearning(supabaseAdmin as SupabaseClient, {
              userId: key.userId,
              runId: run.id,
              goal: run.goal,
              status,
              summary,
              capabilitySlugs,
              evidence: args["evidence"],
              createDraft: hasScope(key, "resources:write"),
            });
            result = textResult({ correlation_id: correlationId, state: status, ...saved });
          } else if (name === "install_capability") {
            await requireControlWrite(key);
            const slug = String(args["resource_id"] ?? "").trim();
            const catalog = await getCatalog();
            const item = catalog.bySlug.get(slug);
            if (!item) throw new Error("Unknown or unpublished capability.");
            if (!isExecutable(item))
              throw new Error(`Capability is ${reviewState(item)} and cannot be installed.`);
            result = executionUnavailable("install", item);
          } else if (name === "preview_composio_sync") {
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error("Use a personal API key to preview personal Composio accounts.");
            if (!hasRole(await loadRoles(key.userId), "admin"))
              throw new Error("Forbidden: admin required");
            const {
              listOwnedManagedConnections,
              listOwnedManagedConnectionsForIdentity,
              listComposioToolkits,
            } = await import("@/lib/managed-connectors.server");
            const { planComposioAccountMapping, planComposioSync } =
              await import("@/lib/composio-sync");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const hasExternalAccountId = Object.prototype.hasOwnProperty.call(
              args,
              "external_account_id",
            );
            const externalAccountValue = args["external_account_id"];
            if (
              hasExternalAccountId &&
              (typeof externalAccountValue !== "string" ||
                !externalAccountValue.trim() ||
                externalAccountValue.trim().length > 256)
            ) {
              throw new Error(
                "External Composio account ID must be a non-empty string of at most 256 characters.",
              );
            }
            const externalAccountId = hasExternalAccountId
              ? (externalAccountValue as string).trim()
              : null;
            const [accounts, catalog] = await Promise.all([
              externalAccountId !== null
                ? listOwnedManagedConnectionsForIdentity(key.userId, externalAccountId)
                : listOwnedManagedConnections(key.userId),
              listComposioToolkits(),
            ]);
            const saved: Array<{
              id: string;
              provider: string;
              display_name: string | null;
              provider_account_id: string | null;
              credential_reference: string | null;
            }> = [];
            for (let offset = 0; ; offset += 200) {
              const { data: page, error } = await supabaseAdmin
                .from("app_connections")
                .select("id,provider,display_name,provider_account_id,credential_reference")
                .eq("user_id", key.userId)
                .order("id", { ascending: true })
                .range(offset, offset + 199);
              if (error) throw new Error("Could not preview saved connectors.");
              saved.push(...(page ?? []));
              if ((page?.length ?? 0) < 200) break;
            }
            const plan = planComposioSync(accounts, saved, catalog);
            const accountMapping = externalAccountId
              ? planComposioAccountMapping(externalAccountId, accounts, saved, catalog)
              : null;
            result = textResult({
              ...(accountMapping
                ? {
                    matched: plan.matched,
                    existing: plan.existing,
                    candidate_count: plan.candidates.length,
                    account_mapping: accountMapping,
                  }
                : plan),
              toolkit_count: catalog.length,
              dry_run: true,
              secrets_exposed: false,
              apply_url: "https://open-connect.site/connections",
              next_action:
                "Run Sync Composio accounts as the authenticated administrator after approval, then assign selected connectors to projects.",
            });
          } else if (name === "sync_composio_accounts") {
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error(
                "Use a personal administrator key to sync personal Composio accounts.",
              );
            await requireControlWrite(key);
            if (args["confirm"] !== true)
              throw new Error("Confirm the exact previewed account IDs before importing.");
            const { listOwnedManagedConnections, listComposioToolkits } =
              await import("@/lib/managed-connectors.server");
            const { composioImportRecords } = await import("@/lib/composio-sync");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const [accounts, catalog] = await Promise.all([
              listOwnedManagedConnections(key.userId),
              listComposioToolkits(),
            ]);
            const saved: Array<{
              provider: string;
              provider_account_id: string | null;
              credential_reference: string | null;
            }> = [];
            for (let offset = 0; ; offset += 200) {
              const { data: page, error } = await supabaseAdmin
                .from("app_connections")
                .select("provider,provider_account_id,credential_reference")
                .eq("user_id", key.userId)
                .order("id")
                .range(offset, offset + 199);
              if (error) throw new Error("Could not read existing connector mappings.");
              saved.push(...(page ?? []));
              if ((page?.length ?? 0) < 200) break;
            }
            const plan = composioImportRecords(
              key.userId,
              accounts,
              saved,
              catalog,
              args["account_ids"],
            );
            if (plan.records.length) {
              const { error } = await supabaseAdmin.from("app_connections").insert(plan.records);
              if (error)
                throw new Error(
                  "Connector import did not complete. Refresh the preview before retrying.",
                );
            }
            result = textResult({
              imported: plan.records.length,
              selected: plan.selected,
              matched: plan.matched,
              existing: plan.existing,
              provider_scopes_changed: false,
              project_access_assigned: false,
              secrets_exposed: false,
            });
          } else if (name === "repair_connection") {
            if (key.projectId || key.workspaceId || key.organizationId)
              throw new Error("Use a personal administrator key to repair owned connections.");
            await requireControlWrite(key);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { repairConnection } = await import("@/lib/connection-repair.server");
            result = textResult(
              await repairConnection(
                supabaseAdmin,
                key.userId,
                args as unknown as import("@/lib/connection-repair").RepairInput,
              ),
            );
          } else if (name === "configure_connection") {
            if (key.projectId || key.workspaceId || key.organizationId) {
              throw new Error("Use a personal API key to configure personal connections.");
            }
            await requireControlWrite(key);
            const provider = normalizeConnectionProvider(args["provider"]);
            const credentialRef = String(args["credential_ref"] ?? "").trim();
            if (!provider || !isOpaqueCredentialReference(credentialRef))
              throw new Error(
                "Provider and valid credential:// reference required; raw secrets are rejected.",
              );
            const scopes = Array.isArray(args["scopes"])
              ? args["scopes"].filter((scope): scope is string => typeof scope === "string")
              : [];
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const displayName = String(args["display_name"] ?? provider);
            let remoteMcpMetadata: { endpoint_url: string; auth_type: string } | undefined;
            if (args["endpoint_url"] !== undefined || isRemoteMcpProvider(provider)) {
              if (!isRemoteMcpProvider(provider)) {
                throw new Error("MCP endpoint requires a remote MCP provider.");
              }
              if (
                !new RegExp(`^credential://${provider}/[0-9a-f-]{36}$`, "i").test(credentialRef)
              ) {
                throw new Error("Remote MCP endpoint requires its owned credential reference.");
              }
              remoteMcpMetadata = {
                endpoint_url: normalizeRemoteMcpEndpoint(provider, args["endpoint_url"]),
                auth_type: normalizeRemoteMcpAuthType(args["auth_type"]),
              };
            }
            let destinationMetadata:
              { telegram_chat_id: string; telegram_message_thread_id: number } | undefined;
            if (args["telegram_destination"] !== undefined) {
              if (provider !== "telegram")
                throw new Error("Telegram destination requires Telegram provider.");
              if (!/^credential:\/\/telegram\/[0-9a-f-]{36}$/i.test(credentialRef))
                throw new Error("Telegram destination requires an owned bot credential reference.");
              const { telegramDestination } = await import("@/lib/telegram.server");
              const value = args["telegram_destination"] as Record<string, unknown> | null;
              if (
                !value ||
                Object.keys(value).some(
                  (field) => !["chat_id", "message_thread_id"].includes(field),
                )
              )
                throw new Error("Invalid Telegram destination fields.");
              const destination = telegramDestination({
                telegram_chat_id: value["chat_id"],
                telegram_message_thread_id: value["message_thread_id"],
              });
              destinationMetadata = {
                telegram_chat_id: destination.chat_id,
                telegram_message_thread_id: destination.message_thread_id,
              };
            }
            const browserMetadata =
              provider === "browser_use" || provider === "browserbase"
                ? await (
                    await import("@/lib/browser-vault.server")
                  ).validateOwnedBrowserReference(key.userId, provider, credentialRef)
                : undefined;
            const { data: existing, error: existingError } = await supabaseAdmin
              .from("app_connections")
              .select("id,status,metadata")
              .eq("user_id", key.userId)
              .eq("provider", provider)
              .eq("credential_reference", credentialRef)
              .maybeSingle();
            if (existingError) throw new Error(existingError.message);
            if (remoteMcpMetadata && !existing) {
              throw new Error("Remote MCP endpoint updates require an existing owned connection.");
            }
            if (remoteMcpMetadata && existing?.status === "connected") {
              const { validateRemoteMcpConfiguration } = await import("@/lib/custom-mcp.server");
              await validateRemoteMcpConfiguration({
                provider: provider as RemoteMcpProvider,
                ownerUserId: key.userId,
                credentialReference: credentialRef,
                endpointUrl: remoteMcpMetadata.endpoint_url,
                authType: remoteMcpMetadata.auth_type as
                  "none" | "bearer" | "api_key" | "personal_access_token",
              });
            }
            const connectionQuery = existing
              ? supabaseAdmin
                  .from("app_connections")
                  .update({
                    display_name: displayName,
                    status: remoteMcpMetadata ? existing.status : "connected",
                    scopes,
                    credential_reference: credentialRef,
                    updated_at: new Date().toISOString(),
                    ...(destinationMetadata || remoteMcpMetadata || browserMetadata
                      ? {
                          metadata: {
                            ...((existing.metadata as Record<string, Json>) ?? {}),
                            ...destinationMetadata,
                            ...remoteMcpMetadata,
                            ...browserMetadata,
                          },
                        }
                      : {}),
                  })
                  .eq("id", existing.id)
                  .eq("user_id", key.userId)
              : supabaseAdmin.from("app_connections").insert({
                  user_id: key.userId,
                  provider,
                  display_name: displayName,
                  provider_account_id: key.userId,
                  status: "connected",
                  scopes,
                  credential_reference: credentialRef,
                  metadata: {
                    source: "chatgpt-mcp",
                    mode: "capability_grant",
                    secrets_exposed: false,
                    ...destinationMetadata,
                    ...browserMetadata,
                  },
                });
            const { data, error } = await connectionQuery
              .select("id,provider,display_name,status,scopes")
              .single();
            if (error) throw new Error(error.message);
            result = textResult({
              connection: data,
              credential_reference: "configured",
              idempotent: true,
            });
          } else if (name === "list_resources") {
            const catalog = await getCatalog();
            const typeFilter = typeof args["type"] === "string" ? args["type"] : null;
            const data = [...catalog.bySlug.values()]
              .filter((r) => !typeFilter || r.resource_type === typeFilter)
              .map((r) => ({
                slug: r.slug,
                name: r.name,
                type: r.resource_type,
                description: r.description,
                review_state: reviewState(r),
                risk: r.installation_config?.["risk"] ?? null,
                canonical_url: r.installation_config?.["canonical_url"] ?? null,
                executable: isExecutable(r),
              }));
            result = textResult({ data, count: data.length });
          } else if (name === "list_connections") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const connections: Array<Record<string, unknown>> = [];
            const pageSize = 200;
            if (key.projectId) {
              await assertProjectAccess(key, key.projectId);
              const { data: shared, error } = await supabaseAdmin
                .from("project_connections")
                .select("app_connections!inner(id,provider,display_name,status,scopes)")
                .eq("project_id", key.projectId)
                .eq("app_connections.status", "connected");
              if (error) throw new Error("Could not list this project's connected apps.");
              connections.push(
                ...(shared ?? []).flatMap((row) =>
                  row.app_connections ? [row.app_connections] : [],
                ),
              );
            } else {
              for (let offset = 0; ; offset += pageSize) {
                const { data: page, error } = await supabaseAdmin
                  .from("app_connections")
                  .select("id, provider, display_name, status, scopes")
                  .eq("user_id", key.userId)
                  .eq("status", "connected")
                  .order("created_at", { ascending: false })
                  .order("id", { ascending: true })
                  .range(offset, offset + pageSize - 1);
                if (error) throw new Error("Could not list connected apps.");
                connections.push(...(page ?? []));
                if ((page?.length ?? 0) < pageSize) break;
              }
            }
            result = textResult({
              data: connections,
              count: connections.length,
              note: "Use id with list_connection_tools and call_connection_tool for Custom MCP connections. Credential values are never returned.",
            });
          } else if (name === "list_models") {
            const { resolveUserUpstreams, fetchMergedModelCatalog } =
              await import("@/lib/gateway.server");
            const configured = await resolveUserUpstreams(key.userId, false);
            const { ids, upstreams, providers } = await fetchMergedModelCatalog(configured);
            result = textResult({
              endpoint: "https://open-connect.site/v1",
              models: ids,
              providers,
              upstreams,
              count: ids.length,
              note: "Catalog uses the authenticated user's AI Gateway connections. Credential values are never returned.",
            });
          } else if (name?.startsWith("resource_")) {
            const match = await findResourceByToolName(name);
            const action = typeof args["action"] === "string" ? args["action"] : "info";

            if (!match) {
              result = textResult({ status: "not_found", tool: name });
            } else if (action === "invoke" && !isExecutable(match)) {
              result = textResult({
                status: reviewState(match),
                resource: {
                  slug: match.slug,
                  name: match.name,
                  type: match.resource_type,
                },
                risk: match.installation_config?.["risk"] ?? null,
                message:
                  "Metadata-only resource cannot be invoked until review and approval are complete.",
              });
            } else if (action === "invoke") {
              result = executionUnavailable("invoke", match);
            } else {
              result = textResult({
                status: "available",
                resource: match,
                note: "Catalog metadata only; provider execution is not configured.",
              });
            }
          } else {
            result = textResult({
              gateway: "open-connect.site",
              scopes: key.scopes,
              tool: name,
            });
          }
        } else if (body.method === "ping") {
          result = {};
        } else {
          result = { error: `Method not implemented: ${body.method}` };
        }

        fireLog(key, 200);
        return streamableMcpResponse(
          request,
          body,
          body.id === undefined
            ? null
            : {
                jsonrpc: "2.0",
                id: body.id,
                result,
              },
        );
      },
    },
  },
});
