import { modelForUpstream } from "@/lib/model-provider-state";
import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
  isAutoFreeModel,
  resolveAutoFreeRoutes,
  resolveModelId,
  resolveOpenAutoRoutes,
  resolveUserUpstreams,
} from "@/lib/gateway.server";
import { isOpenAutoRequest } from "@/lib/open-auto-router";

export const Route = createFileRoute("/v1/chat/completions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) {
          return gatewayError("Missing or invalid Open-Connect key.", 401, "invalid_api_key");
        }
        if (!hasScope(key, "models:invoke")) {
          return gatewayError("Key is missing the models:invoke scope.", 403, "insufficient_scope");
        }

        const upstreams = await resolveUserUpstreams(key.userId);
        if (upstreams.length === 0) {
          return gatewayError("Model gateway is not configured.", 503, "upstream_unavailable");
        }

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || (body["model"] != null && typeof body["model"] !== "string")) {
          return gatewayError("The `model` field must be a string.", 400, "invalid_request");
        }

        const requestedModel =
          typeof body["model"] === "string" && body["model"].trim()
            ? (body["model"] as string).trim()
            : "open-connect/auto";
        const autoFree = isAutoFreeModel(requestedModel);
        const openAuto = isOpenAutoRequest(requestedModel);
        const routes = openAuto
          ? await resolveOpenAutoRoutes(upstreams)
          : autoFree
            ? await resolveAutoFreeRoutes(upstreams)
            : upstreams.map((upstream) => ({
                upstream,
                model: modelForUpstream(resolveModelId(requestedModel), upstream.name),
              }));
        if (routes.length === 0) {
          return gatewayError(
            "No connected free-tier or Open-Auto model route is available.",
            503,
            "free_models_unavailable",
          );
        }
        const streaming = body["stream"] === true;

        let lastError: { status: number; body: unknown } | null = null;

        const deadline = Date.now() + 35_000;
        for (const route of routes) {
          if ((autoFree || openAuto) && !streaming && Date.now() >= deadline) break;
          const { upstream, model } = route;
          try {
            const response = await fetch(`${upstream.baseUrl}/chat/completions`, {
              method: "POST",
              headers: upstream.headers,
              redirect: "manual",
              body: JSON.stringify({ ...body, model }),
              signal: AbortSignal.timeout(
                (autoFree || openAuto) && !streaming
                  ? Math.max(1, Math.min(12_000, deadline - Date.now()))
                  : 120_000,
              ),
            });

            if (streaming) {
              if (!response.ok) {
                lastError = {
                  status: response.status,
                  body: await response.json().catch(() => ({})),
                };
                continue;
              }
              await logGatewayRequest({
                key,
                endpoint: "/v1/chat/completions",
                model: requestedModel,
                statusCode: response.status,
                upstream: upstream.name,
              });
              return new Response(response.body, {
                status: response.status,
                headers: {
                  "content-type": response.headers.get("content-type") ?? "text/event-stream",
                  "cache-control": "no-cache",
                  "x-open-connect-upstream": upstream.name,
                  "x-open-connect-model": model,
                },
              });
            }

            const result = (await response.json()) as {
              usage?: { total_tokens?: number };
              error?: unknown;
            };

            if (!response.ok) {
              lastError = { status: response.status, body: result };
              // try the next route on 5xx / 404, and rotate for Open-Auto tiered routing
              if (autoFree || openAuto || response.status >= 500 || response.status === 404) continue;
              await logGatewayRequest({
                key,
                endpoint: "/v1/chat/completions",
                model: requestedModel,
                statusCode: response.status,
                upstream: upstream.name,
              });
              return json(result, response.status);
            }

            await logGatewayRequest({
              key,
              endpoint: "/v1/chat/completions",
              model: requestedModel,
              statusCode: response.status,
              upstream: upstream.name,
              totalTokens: result.usage?.total_tokens ?? null,
            });

            return json(result, response.status);
          } catch {
            lastError = { status: 502, body: { error: { message: "Upstream request failed" } } };
          }
        }

        await logGatewayRequest({
          key,
          endpoint: "/v1/chat/completions",
          model: requestedModel,
          statusCode: lastError?.status ?? 502,
          upstream: routes.map((route) => route.upstream.name).join("+"),
        });

        return json(
          lastError?.body ?? {
            error: {
              message: "All model upstreams failed",
              type: "open_connect_error",
              code: "upstream_failed",
            },
          },
          lastError?.status ?? 502,
        );
      },
    },
  },
});
