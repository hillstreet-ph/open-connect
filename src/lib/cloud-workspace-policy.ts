const NATIVE_PROVIDER_WRITE_PATHS = new Set(["twilio", "telegram"]);

/**
 * Native provider writes require the API-key scopes and admin checks enforced by
 * the Open-Connect MCP route. The authenticated Cloud workspace has project
 * membership context only, so it must remain read-only for those providers.
 */
export function assertCloudWorkspaceToolAllowed(
  provider: string,
  annotations: Record<string, unknown>,
) {
  if (NATIVE_PROVIDER_WRITE_PATHS.has(provider) && annotations["readOnlyHint"] !== true) {
    throw new Error(
      "Write-capable native provider tools must be invoked through Open-Connect MCP with admin and provider-invoke authorization.",
    );
  }
}
