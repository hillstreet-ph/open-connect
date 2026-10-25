/** Independently saved Vault items belong to the user, not to their connection binding. */
export function connectionOwnedSecretId(reference: string | null | undefined, metadata: unknown) {
  if (
    metadata &&
    typeof metadata === "object" &&
    "credential_reuse" in metadata &&
    metadata.credential_reuse === true
  )
    return null;
  return reference?.match(/^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i)?.[1] ?? null;
}
