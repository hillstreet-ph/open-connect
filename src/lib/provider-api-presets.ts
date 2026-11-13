const createBody = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { name: { type: "string", minLength: 1, maxLength: 100 } },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
};

/** Documented organization APIs; never consumer chat history or secret-key export. */
export const PROVIDER_API_PRESETS = [
  {
    id: "openai-admin",
    name: "OpenAI organization administration",
    auth: "bearer",
    header: "Authorization",
    endpoint: "https://api.openai.com/v1",
    description:
      "Requires an OpenAI organization Admin API key. Lists and creates API projects; does not administer ChatGPT subscriptions or expose chat history.",
    documentation: "https://developers.openai.com/api/reference/administration/overview",
    schema: {
      openapi: "3.0.3",
      info: { title: "OpenAI organization projects", version: "1" },
      servers: [{ url: "https://api.openai.com/v1" }],
      paths: {
        "/organization/projects": {
          get: { operationId: "openai_list_projects", summary: "List API organization projects" },
          post: {
            operationId: "openai_create_project",
            summary: "Create an API organization project",
            requestBody: createBody,
          },
        },
      },
    },
  },
  {
    id: "anthropic-admin",
    name: "Anthropic organization administration",
    auth: "api_key",
    header: "x-api-key",
    endpoint: "https://api.anthropic.com/v1",
    description:
      "Requires a provider-authorized Anthropic Admin API key. Lists and creates API organization workspaces; does not grant Claude consumer or Enterprise administration.",
    documentation: "https://platform.claude.com/docs/en/manage-claude/admin-api",
    schema: {
      openapi: "3.0.3",
      info: { title: "Anthropic organization workspaces", version: "1" },
      servers: [{ url: "https://api.anthropic.com/v1" }],
      paths: {
        "/organizations/workspaces": {
          get: {
            operationId: "anthropic_list_workspaces",
            summary: "List API organization workspaces",
          },
          post: {
            operationId: "anthropic_create_workspace",
            summary: "Create an API organization workspace",
            requestBody: createBody,
          },
        },
      },
    },
  },
] as const;

export function providerApiHeaders(endpoint: string): Record<string, string> {
  return new URL(endpoint).origin === "https://api.anthropic.com"
    ? { "anthropic-version": "2023-06-01" }
    : {};
}
