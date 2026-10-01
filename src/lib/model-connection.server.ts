/** Build an OpenRouter upstream only from the authenticated user's connection. */
export async function savedOpenRouter(
  userId: string,
  dependencies: {
    find: (
      userId: string,
    ) => Promise<{ status: string; credential_reference: string | null } | null>;
    resolve: (userId: string, credentialId: string) => Promise<string>;
  },
) {
  if (!userId) throw new Error("Authenticated model user required.");
  const connection = await dependencies.find(userId);
  if (!connection) return null;
  if (connection.status !== "connected")
    throw new Error("Verify your OpenRouter connection first.");
  const match = connection.credential_reference?.match(
    /^credential:\/\/openrouter\/([0-9a-f-]{36})$/i,
  );
  if (!match) throw new Error("Reconnect OpenRouter to restore its credential reference.");
  const raw = await dependencies.resolve(userId, match[1]!);
  let credential = raw;
  try {
    const payload = JSON.parse(raw) as { credential?: unknown };
    if (typeof payload.credential !== "string") throw new Error("Invalid credential");
    credential = payload.credential;
  } catch {
    if (!raw.startsWith("sk-or-")) throw new Error("OpenRouter credential is invalid.");
  }
  if (!credential.trim()) throw new Error("OpenRouter credential is empty.");
  return {
    name: "openrouter" as const,
    baseUrl: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      "X-Title": "Open-Connect",
    },
  };
}
