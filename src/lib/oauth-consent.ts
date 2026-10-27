/** Bound consent RPCs without retrying a grant whose server outcome is unknown. */
export async function withOAuthRequestTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error("Connection timed out. Please restart the connection from your client."),
          );
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
