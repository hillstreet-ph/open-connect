import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchFreeModelCatalog,
  isAutoFreeModel,
  liteLlmFreeModels,
  openRouterFreeModels,
} from "./model-catalog.ts";

test("OpenRouter free catalog includes zero-price and explicit free variants only", () => {
  const models = openRouterFreeModels({
    data: [
      { id: "meta-llama/free-one:free", name: "Free One", pricing: { prompt: "0.1" } },
      { id: "google/free-two", pricing: { prompt: "0", completion: "0", request: "0" } },
      { id: "openai/paid", pricing: { prompt: "0.0001", completion: "0.0002" } },
      { id: "unknown/price" },
    ],
  });
  assert.deepEqual(
    models.map((model) => model.id),
    ["meta-llama/free-one:free", "google/free-two"],
  );
  assert.equal(models[0]?.provider, "meta-llama");
});

test("LiteLLM only marks explicitly zero input and output costs as free", () => {
  const models = liteLlmFreeModels({
    data: [
      {
        model_name: "gemini-free",
        model_info: { input_cost_per_token: 0, output_cost_per_token: "0" },
      },
      {
        model_name: "paid",
        model_info: { input_cost_per_token: 0, output_cost_per_token: 0.00001 },
      },
      { model_name: "missing-price", model_info: {} },
    ],
  });
  assert.deepEqual(
    models.map((model) => model.id),
    ["gemini-free"],
  );
});

test("free catalog fetches OpenRouter and LiteLLM only without following redirects", async () => {
  const requested: string[] = [];
  const models = await fetchFreeModelCatalog(
    [
      { name: "openrouter", baseUrl: "https://openrouter.ai/api/v1", headers: {} },
      { name: "litellm", baseUrl: "https://proxy.example/v1", headers: {} },
    ],
    async (url, init) => {
      requested.push(String(url));
      assert.equal(init?.redirect, "manual");
      if (String(url).endsWith("/models")) {
        return Response.json({
          data: [{ id: "qwen/free:free", pricing: { prompt: "0", completion: "0" } }],
        });
      }
      if (String(url) === "https://proxy.example/model/info") {
        return Response.json({
          data: [
            {
              model_name: "proxy/free",
              model_info: { input_cost_per_token: 0, output_cost_per_token: 0 },
            },
          ],
        });
      }
      return new Response(null, { status: 404 });
    },
  );
  assert.deepEqual(
    models.map((model) => `${model.source}:${model.id}`),
    ["litellm:proxy/free", "openrouter:qwen/free:free"],
  );
  assert.deepEqual(requested, [
    "https://openrouter.ai/api/v1/models",
    "https://proxy.example/model/info",
  ]);
});

test("Auto aliases use connected free routes and do not absorb named models", () => {
  for (const model of ["", "Auto", "free", "open-connect/auto", "open-connect/free"]) {
    assert.equal(isAutoFreeModel(model), true);
  }
  assert.equal(isAutoFreeModel("openai/gpt-4o"), false);
  assert.equal(isAutoFreeModel("openrouter/free"), false);
});
