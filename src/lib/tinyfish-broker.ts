import { createTinyFishClient, TINYFISH_API } from "./tinyfish.ts";
export type TinyFishBrokerAccount = {
  user_id?: string;
  status?: string;
  toolkit?: { slug?: string };
  is_disabled?: boolean;
  auth_config?: { is_disabled?: boolean };
};
export function tinyFishBrokerOwner(account: TinyFishBrokerAccount, allowedIdentities: string[]) {
  if (
    account.status !== "ACTIVE" ||
    account.is_disabled ||
    account.auth_config?.is_disabled ||
    account.toolkit?.slug !== "tinyfish" ||
    !account.user_id ||
    !allowedIdentities.includes(account.user_id)
  )
    throw new Error("TinyFish broker account is not ACTIVE and owned by this user.");
  return account.user_id;
}
export type TinyFishProxyRequest = {
  endpoint: string;
  method: string;
  body?: Record<string, unknown>;
};
/** Broker injects authentication; provider keys and broker response headers never reach callers. */
export function createBrokeredTinyFishClient(
  proxy: (request: TinyFishProxyRequest) => Promise<{ status: number; data: unknown }>,
) {
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (
      url.origin !== TINYFISH_API ||
      url.username ||
      url.password ||
      !/^\/v1\/(?:profiles(?:\/|$)|runs(?:\/|$)|automation\/run-async$|wallet$)/.test(url.pathname)
    )
      throw new Error(
        "This TinyFish operation requires a direct provider credential; the broker is limited to the agent API.",
      );
    const method = init?.method ?? "GET";
    if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method))
      throw new Error("Unsupported TinyFish method.");
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    const result = await proxy({ endpoint: url.toString(), method, ...(body ? { body } : {}) });
    if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599)
      throw new Error("TinyFish broker returned an invalid upstream status.");
    if (result.status >= 400)
      return Response.json(
        {
          error: {
            code: `HTTP_${result.status}`,
            message: `TinyFish returned HTTP ${result.status} through the account broker.`,
          },
        },
        { status: result.status },
      );
    return result.status === 204
      ? new Response(null, { status: 204 })
      : Response.json(result.data, { status: result.status });
  };
  // Sentinel is consumed only by the injected transport; it is never sent to a provider.
  return createTinyFishClient("broker-managed", send);
}
