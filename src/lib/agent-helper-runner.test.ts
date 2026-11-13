import test from "node:test";
import assert from "node:assert/strict";
import { runAgentHelper } from "./agent-helper-runner.ts";
const call = (name: string) => ({
  content: "",
  message: { role: "assistant" },
  toolCalls: [{ id: name, type: "function" as const, function: { name, arguments: "{}" } }],
});
const done = { content: "Done", toolCalls: [] };
test("can look up a project before writing and stops after the write", async () => {
  const executed: string[] = [];
  const tools: boolean[] = [];
  const result = await runAgentHelper({
    first: call("list_projects"),
    messages: [],
    execute: async (name) => {
      executed.push(name);
      return { id: "example", title: "Example" };
    },
    requestNext: async (_, includeTools) => {
      tools.push(includeTools);
      return tools.length === 1 ? call("create_task") : done;
    },
  });
  assert.deepEqual(executed, ["list_projects", "create_task"]);
  assert.deepEqual(tools, [true]);
  assert.equal(result.action?.name, "create_task");
});
test("never executes a second write even if the model asks for one", async () => {
  let count = 0;
  await runAgentHelper({
    first: call("create_task"),
    messages: [],
    execute: async () => {
      count++;
      return { id: "task" };
    },
    requestNext: async () => call("create_task"),
  });
  assert.equal(count, 1);
});
test("keeps the authoritative result if the model fails after a write", async () => {
  const result = await runAgentHelper({
    first: call("create_task"),
    messages: [],
    execute: async () => ({ id: "task", title: "Example" }),
    requestNext: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(result.action?.result["id"], "task");
  assert.ok(result.reply);
});
test("rejects unknown actions and bounds repeated lookups", async () => {
  let count = 0;
  const execute = async () => {
    count++;
    return {};
  };
  await runAgentHelper({
    first: call("delete_all"),
    messages: [],
    execute,
    requestNext: async () => done,
  });
  assert.equal(count, 0);
  await runAgentHelper({
    first: call("list_projects"),
    messages: [],
    execute,
    requestNext: async () => call("list_projects"),
  });
  assert.equal(count, 4);
});

test("never lets a model obscure an authoritative tool failure", async () => {
  let requests = 0;
  const result = await runAgentHelper({
    first: call("create_task"),
    messages: [],
    execute: async () => ({ error: "Write result is uncertain." }),
    requestNext: async () => {
      requests++;
      return { content: "Successfully created!", toolCalls: [] };
    },
  });
  assert.equal(requests, 0);
  assert.match(result.reply, /couldn't complete/);
  assert.match(result.reply, /Check the current state/);
  assert.doesNotMatch(result.reply, /No change was made/);
});

test("retrieves scoped context before a workspace action", async () => {
  const executed: string[] = [];
  await runAgentHelper({
    first: call("search_saved_context"),
    messages: [],
    execute: async (name) => {
      executed.push(name);
      return { records: [] };
    },
    requestNext: async () => done,
  });
  assert.deepEqual(executed, ["search_saved_context"]);
});

test("completed writes use their receipt without a model success rewrite", async () => {
  let requests = 0;
  const result = await runAgentHelper({
    first: call("create_task"),
    messages: [],
    execute: async () => ({ created: true, task: { title: "Verified task" } }),
    requestNext: async () => {
      requests++;
      return { content: "I also configured all apps", toolCalls: [] };
    },
  });
  assert.equal(requests, 0);
  assert.match(result.reply, /Created the task “Verified task”/);
  assert.doesNotMatch(result.reply, /configured all apps/);
});
