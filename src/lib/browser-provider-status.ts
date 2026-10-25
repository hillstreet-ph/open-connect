/** A finished agent can still have a browser that is releasing resources. */
export function providerPollInterval(
  state: { terminal: boolean; cleanupConfirmed: boolean } | undefined,
  hasError = false,
): false | 5000 {
  return hasError || (state?.terminal === true && state.cleanupConfirmed) ? false : 5000;
}
