export const AVAILABLE_KEY_SCOPES = [
  "openid",
  "mcp:connect",
  "resources:read",
  "resources:write",
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
    "connections:read",
    "models:read",
    "secrets:read",
  ],
  builder: [
    "openid",
    "mcp:connect",
    "resources:read",
    "resources:write",
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
