export const AVAILABLE_KEY_SCOPES = [
  "openid",
  "mcp:connect",
  "resources:read",
  "resources:write",
  "memory:read",
  "knowledge:read",
  "connections:read",
  "connections:invoke",
  "models:read",
  "models:invoke",
  "tools:invoke",
  "secrets:read",
  "agents:invoke",
  "control:write",
] as const;

export type KeyScope = (typeof AVAILABLE_KEY_SCOPES)[number];
export type AccessProfile = "read_only" | "builder" | "developer" | "administrator" | "custom";

export const ACCESS_PROFILES: Record<Exclude<AccessProfile, "custom">, readonly KeyScope[]> = {
  read_only: [
    "openid",
    "mcp:connect",
    "resources:read",
    "memory:read",
    "knowledge:read",
    "connections:read",
    "models:read",
    "secrets:read",
  ],
  builder: [
    "openid",
    "mcp:connect",
    "resources:read",
    "resources:write",
    "memory:read",
    "knowledge:read",
    "connections:read",
    "connections:invoke",
    "models:read",
    "models:invoke",
    "tools:invoke",
    "agents:invoke",
  ],
  developer: [
    "openid",
    "mcp:connect",
    "resources:read",
    "resources:write",
    "memory:read",
    "knowledge:read",
    "connections:read",
    "connections:invoke",
    "models:read",
    "models:invoke",
    "tools:invoke",
    "secrets:read",
    "agents:invoke",
  ],
  administrator: AVAILABLE_KEY_SCOPES,
};

export function scopesForProfile(profile: AccessProfile, custom: string[] = []): KeyScope[] {
  const requested = profile === "custom" ? custom : ACCESS_PROFILES[profile];
  return AVAILABLE_KEY_SCOPES.filter((scope) => requested.includes(scope));
}

export function isAccessProfile(value: string): value is AccessProfile {
  return ["read_only", "builder", "developer", "administrator", "custom"].includes(value);
}

export function validateKeyAccessChange(input: { id: string; profile: string; scopes?: string[] }) {
  if (!input || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.id)) {
    throw new Error("Choose an existing API key");
  }
  if (!isAccessProfile(input.profile)) throw new Error("Choose a supported access profile");
  if (
    input.scopes !== undefined &&
    (!Array.isArray(input.scopes) ||
      input.scopes.some((scope) => !(AVAILABLE_KEY_SCOPES as readonly string[]).includes(scope)))
  ) {
    throw new Error("Unsupported API key permission");
  }
  return {
    id: input.id,
    profile: input.profile,
    scopes: scopesForProfile(input.profile, input.scopes),
  };
}

export function requireKeyScopeAuthority(roles: readonly string[], scopes: readonly string[]) {
  if (
    scopes.includes("control:write") &&
    !roles.some((role) => role === "admin" || role === "owner")
  ) {
    throw new Error("Administrator permissions require an Admin account");
  }
}

export type CapabilityKind = "identity" | "read" | "interact" | "write";

/** Human-readable capability for each scope, with a read / interact / write kind. */
export const SCOPE_CAPABILITIES: Record<KeyScope, { label: string; kind: CapabilityKind }> = {
  openid: { label: "Verify your sign-in identity", kind: "identity" },
  "mcp:connect": { label: "Connect to the MCP server", kind: "identity" },
  "resources:read": { label: "Read resources", kind: "read" },
  "resources:write": { label: "Create and edit resources", kind: "write" },
  "memory:read": { label: "Read memory", kind: "read" },
  "knowledge:read": { label: "Read knowledge", kind: "read" },
  "connections:read": { label: "View connected accounts", kind: "read" },
  "connections:invoke": { label: "Run connector tools on connected apps", kind: "interact" },
  "models:read": { label: "List models", kind: "read" },
  "models:invoke": { label: "Run model inference", kind: "interact" },
  "tools:invoke": { label: "Run platform tools (cloud browser, sandboxes)", kind: "interact" },
  "secrets:read": { label: "Read credential metadata (never secret values)", kind: "read" },
  "agents:invoke": { label: "Run agents", kind: "interact" },
  "control:write": { label: "Publish resources and run admin control operations", kind: "write" },
};

export function scopeCapability(scope: string): { label: string; kind: CapabilityKind } {
  return (
    (SCOPE_CAPABILITIES as Record<string, { label: string; kind: CapabilityKind }>)[scope] ?? {
      label: scope,
      kind: "read",
    }
  );
}
