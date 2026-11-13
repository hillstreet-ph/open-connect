import test from "node:test";
import assert from "node:assert/strict";
import { modelProviderState, modelForUpstream } from "./model-provider-state.ts";

test("a stale imported account does not force a healthy provider to reconnect", () => {
  const accounts = [
    { id: "old", provider: "openai", status: "connected", gateway_ready: false },
    { id: "work", provider: "openai", status: "connected", gateway_ready: true },
    { id: "other", provider: "groq", status: "connected", gateway_ready: true },
  ];
  const state = modelProviderState(accounts, "openai");
  assert.equal(state.needsReconnect, false);
  assert.deepEqual(
    state.ready.map((account) => account.id),
    ["work"],
  );
  assert.deepEqual(
    state.accounts.map((account) => account.id),
    ["old", "work"],
  );
  assert.equal(modelProviderState(accounts.slice(0, 1), "openai").needsReconnect, true);
  assert.equal(modelProviderState(accounts, "huggingface").needsReconnect, false);
});

test("native model IDs are normalized without changing router or Hugging Face IDs", () => {
  assert.equal(modelForUpstream("openai/gpt-4o", "openai"), "gpt-4o");
  assert.equal(modelForUpstream("google/gemini-2.5-flash", "google"), "gemini-2.5-flash");
  for (const provider of ["openrouter", "kilo", "commandcode", "huggingface"]) {
    assert.equal(modelForUpstream("openai/gpt-4o", provider), "openai/gpt-4o");
  }
});
