import assert from "node:assert/strict";
import test from "node:test";
import { exportHistory, exportResponse, normalizeConversation } from "./chatgpt-export.mjs";

const sample = {
  id: "conversation-1",
  title: "Project notes",
  mapping: {
    a: {
      message: {
        id: "a",
        author: { role: "user" },
        content: { parts: ["Question"] },
        create_time: 1,
      },
    },
    b: {
      message: {
        id: "b",
        author: { role: "assistant" },
        content: { parts: ["Answer"] },
        create_time: 2,
      },
    },
  },
};

test("converts user-provided conversation to independent Markdown", () => {
  const [file] = exportHistory([sample]);
  assert.match(file.filename, /Project-notes/);
  assert.match(file.content, /## assistant\n\nAnswer/);
  assert.equal(normalizeConversation(sample).messages.length, 2);
});

test("exports one response to JSON", () => {
  const file = exportResponse({ text: "A single answer", format: "json" });
  assert.equal(JSON.parse(file.content).messages[0].text, "A single answer");
});

test("rejects malformed exports and blank responses", () => {
  assert.throws(() => exportHistory({}), /array/);
  assert.throws(() => exportResponse({ text: "" }), /required/);
});
