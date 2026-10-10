const string = { type: "string" };
const boolean = { type: "boolean" };
const count = { type: ["integer", "null"], minimum: 0 };
const strings = { type: "array", items: string };
const auto = {
  type: "object",
  properties: {
    enabled: { type: ["boolean", "null"] },
    available: boolean,
    scope: string,
    discovery: boolean,
    approval_policy: { const: "host_and_provider_enforced" },
    credentials: { const: "metadata_only_until_secure_injection_verified" },
  },
  required: ["enabled", "available", "scope", "discovery", "approval_policy", "credentials"],
  additionalProperties: false,
};
export const AUTO_MODE_OUTPUT_SCHEMA = {
  type: "object",
  properties: { auto, instructions: string },
  required: ["auto", "instructions"],
  additionalProperties: false,
};
export const AUTO_DISCOVERY_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...AUTO_MODE_OUTPUT_SCHEMA.properties,
    goal: string,
    matches: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          slug: string,
          name: string,
          description: { type: ["string", "null"] },
          resourceType: string,
          installationType: { type: ["string", "null"] },
          score: { type: "integer", minimum: 1 },
          matchedTerms: strings,
        },
        required: ["slug", "name", "resourceType", "score", "matchedTerms"],
        additionalProperties: false,
      },
    },
    execution_performed: { const: false },
    values_exposed: { const: false },
    status: { enum: ["unavailable", "disabled", "matched", "no_match"] },
    next_action: string,
  },
  required: [
    "auto",
    "instructions",
    "goal",
    "matches",
    "execution_performed",
    "values_exposed",
    "status",
    "next_action",
  ],
  additionalProperties: false,
};
export const AUTO_STATUS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    auto,
    gateway: string,
    user_id: string,
    scopes: strings,
    planes: {
      type: "object",
      properties: {
        resources: {
          type: "object",
          properties: { published: { type: "integer", minimum: 0 } },
          required: ["published"],
          additionalProperties: false,
        },
        connections: {
          type: "object",
          properties: { connected: count, available: boolean },
          required: ["connected", "available"],
          additionalProperties: false,
        },
        models: {
          type: "object",
          properties: { endpoint: string, aliases: strings },
          required: ["endpoint", "aliases"],
          additionalProperties: false,
        },
      },
      required: ["resources", "connections", "models"],
      additionalProperties: false,
    },
  },
  required: ["auto", "gateway", "planes", "scopes", "user_id"],
  additionalProperties: false,
};
