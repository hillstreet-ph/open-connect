import { lookup, resolve4, resolve6 } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { normalizeRemoteMcpEndpoint } from "./remote-mcp.ts";
export async function publicFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  normalizeRemoteMcpEndpoint("custom_mcp", url.href);
  if (url.port && url.port !== "443") throw new Error("Only public HTTPS port 443 is supported");
  const worker = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  const addresses = worker
    ? (await Promise.allSettled([resolve4(url.hostname), resolve6(url.hostname)])).flatMap(
        (result, index) =>
          result.status === "fulfilled"
            ? result.value.map((address) => ({ address, family: index === 0 ? 4 : 6 }))
            : [],
      )
    : await lookup(url.hostname, { all: true });
  if (!addresses.length) throw new Error("Host has no public address");
  for (const a of addresses) {
    normalizeRemoteMcpEndpoint(
      "custom_mcp",
      `https://${isIP(a.address) === 6 ? `[${a.address}]` : a.address}/`,
    );
    if (
      (isIP(a.address) === 6 && !/^[23][0-9a-f]{3}:/i.test(a.address)) ||
      (isIP(a.address) === 4 && Number(a.address.split(".")[0]) >= 224)
    )
      throw new Error("Special network address blocked");
    if (
      a.address === "0.0.0.0" ||
      a.address.startsWith("192.0.") ||
      a.address.startsWith("198.18.") ||
      a.address.startsWith("198.19.")
    )
      throw new Error("Private or special network address blocked");
  }
  if (worker) return boundedWorkerFetch(url, init);
  const address = addresses[0]!;
  const headers = {
    ...Object.fromEntries(new Headers(init?.headers)),
    "accept-encoding": "identity",
  };
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: init?.method || "GET",
        family: address.family,
        headers,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        timeout: 15000,
      },
      (res) => {
        const parts: Uint8Array[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > 2 * 1024 * 1024) {
            req.destroy();
            reject(new Error("Remote response exceeds 2 MB"));
            return;
          }
          parts.push(chunk);
        });
        res.on("error", () => reject(new Error("Remote response could not be read")));
        res.on("end", () => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers))
            if (v) h.set(k, Array.isArray(v) ? v.join(", ") : v);
          resolve(
            new Response(
              [204, 205, 304].includes(res.statusCode || 0) || init?.method === "HEAD"
                ? null
                : Buffer.concat(parts),
              {
                status: res.statusCode || 502,
                headers: h,
              },
            ),
          );
        });
      },
    );
    const deadline = setTimeout(() => req.destroy(new Error("Remote request timed out")), 15000);
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy(new Error("Remote request timed out")));
    req.on("error", () => reject(new Error("Could not reach the public HTTPS endpoint")));
    if (init?.signal) {
      if (init.signal.aborted) {
        req.destroy();
        reject(new Error("Request cancelled"));
        return;
      }
      init.signal.addEventListener("abort", () => req.destroy(new Error("Request cancelled")), {
        once: true,
      });
    }
    if (init?.body) {
      if (
        typeof init.body !== "string" &&
        !(init.body instanceof Uint8Array) &&
        !(init.body instanceof URLSearchParams)
      ) {
        req.destroy();
        reject(new Error("Unsupported request body"));
        return;
      }
      req.write(init.body instanceof URLSearchParams ? init.body.toString() : init.body);
    }
    req.end();
  });
}
export async function publicText(url: string): Promise<string> {
  const r = await publicFetch(url, {
    headers: {
      Accept: "application/json, text/plain, text/markdown, text/html",
      "User-Agent": "Open-Connect-Resource-Import/1.0",
    },
  });
  if (!r.ok) throw new Error(`Source returned HTTP ${r.status}. Enter the final public file URL.`);
  return r.text();
}

/** Workers global fetch has public-Internet isolation; no private-network bindings are used. */
export async function boundedWorkerFetch(
  url: URL,
  init?: RequestInit,
  send: typeof fetch = fetch,
): Promise<Response> {
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
  const response = await send(url, { ...init, redirect: "manual", signal });
  if ([204, 205, 304].includes(response.status) || init?.method === "HEAD")
    return new Response(null, { status: response.status, headers: response.headers });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) throw new Error("Remote response exceeds 2 MB");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(bytes, { status: response.status, headers });
}
