type AuthFailure = {
  status?: number | undefined;
  name?: string | undefined;
  code?: string | undefined;
};
const UNAVAILABLE =
  "Your saved sign-in could not be verified. Check your connection and retry; you do not need to sign in again unless your session has expired.";

/** Only an authoritative missing/invalid session sends the user back to sign-in. */
export async function verifyPersistentSession<T>(
  getUser: () => Promise<{ data: { user: T | null }; error: AuthFailure | null }>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let result;
    try {
      result = await getUser();
    } catch {
      // Fetch/connection failures must not be interpreted as an expired session.
      if (attempt === 0) continue;
      throw new Error(UNAVAILABLE);
    }
    if (!result.error) return result.data.user;
    if (
      [400, 401, 403].includes(result.error.status ?? -1) ||
      result.error.name === "AuthSessionMissingError"
    )
      return null;
    if (attempt === 1) throw new Error(UNAVAILABLE);
  }
  throw new Error(UNAVAILABLE);
}
