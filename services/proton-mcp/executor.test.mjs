import test from "node:test";
import assert from "node:assert/strict";
import { executorConfig, invoke, toolsFor } from "./executor.mjs";

const env = {
  PROTON_MCP_PROVIDER: "proton_pass",
  PROTON_MCP_ACCOUNT_ID: "profile-fixture",
  PROTON_PASS_BINARY: "/opt/proton/pass-cli",
  PROTON_PASS_SESSION_DIR: "/private/pass",
  PROTON_MCP_ALLOW_WRITES: "true",
  PROTON_MCP_BEARER_TOKEN: "never-forward-this-token",
  OPENAI_API_KEY: "unrelated-secret",
  PROTON_PASS_PERSONAL_ACCESS_TOKEN: "native-login-only",
};
test("requires explicit account, fixed executable and isolated encrypted store", () => {
  for (const override of [
    { PROTON_MCP_PROVIDER: "other" },
    { PROTON_MCP_ACCOUNT_ID: "" },
    { PROTON_PASS_BINARY: "pass-cli" },
    { PROTON_PASS_SESSION_DIR: "relative" },
  ])
    assert.throws(() => executorConfig({ ...env, ...override }));
  assert.throws(() =>
    executorConfig({
      ...env,
      PROTON_MCP_PROVIDER: "proton_drive",
      PROTON_DRIVE_BINARY: "/opt/proton-drive",
      PROTON_DRIVE_CACHE_DIR: "/private/drive",
      PROTON_DRIVE_CREDENTIALS_STORE: "unsafe_file",
    }),
  );
});
test("Pass metadata allowlist drops all secret fields and isolates child credentials", async () => {
  const result = await invoke(
    executorConfig(env),
    "pass_list_items",
    { share_id: "share-fixture" },
    env,
    async (binary, args, options) => {
      assert.equal(binary, env.PROTON_PASS_BINARY);
      assert.deepEqual(args, ["item", "list", "--share-id", "share-fixture", "--output", "json"]);
      assert.equal(options.shell, false);
      assert.equal(options.env.OPENAI_API_KEY, undefined);
      assert.equal(options.env.PROTON_MCP_BEARER_TOKEN, undefined);
      assert.equal(options.env.PROTON_PASS_PERSONAL_ACCESS_TOKEN, undefined);
      return {
        stdout: JSON.stringify({
          items: [
            { id: "item", title: "Example", password: "secret", content: { token: "secret" } },
          ],
        }),
      };
    },
  );
  assert.deepEqual(result, { items: [{ id: "item", title: "Example" }] });
});
test("writes require host permission plus per-call confirmation and audited rename reason", async () => {
  const readonly = executorConfig({ ...env, PROTON_MCP_ALLOW_WRITES: "false" });
  assert.ok(toolsFor(readonly).every((tool) => tool.annotations.readOnlyHint));
  await assert.rejects(
    invoke(readonly, "pass_create_vault", { name: "Test", confirm: true }),
    /unavailable/,
  );
  await assert.rejects(
    invoke(executorConfig(env), "pass_create_vault", { name: "Test" }),
    /confirmation/,
  );
  await assert.rejects(
    invoke(executorConfig(env), "pass_rename_vault", {
      share_id: "id",
      name: "Name",
      confirm: true,
    }),
    /argument/,
  );
  await invoke(
    executorConfig(env),
    "pass_rename_vault",
    { share_id: "id", name: "Name", reason: "Requested rename", confirm: true },
    env,
    async (_, args, options) => {
      assert.deepEqual(args, ["vault", "update", "--share-id", "id", "--name", "Name"]);
      assert.equal(options.env.PROTON_PASS_AGENT_REASON, "Requested rename");
      return { stdout: "Updated vault" };
    },
  );
});
test("rejects cross-provider operations, shell flags, unexpected fields and path traversal", async () => {
  const pass = executorConfig(env);
  await assert.rejects(invoke(pass, "drive_list_files"), /unavailable/);
  await assert.rejects(invoke(pass, "pass_list_items", { share_id: "--show-secrets" }), /argument/);
  await assert.rejects(invoke(pass, "pass_list_vaults", { command: "shell" }), /arguments/);
  const drive = executorConfig({
    ...env,
    PROTON_MCP_PROVIDER: "proton_drive",
    PROTON_DRIVE_BINARY: "/opt/drive",
    PROTON_DRIVE_CACHE_DIR: "/private/drive",
  });
  for (const path of ["/my-files/../secret", "/etc/passwd", "--help"])
    await assert.rejects(invoke(drive, "drive_list_files", { path }), /path|argument/);
  await invoke(
    drive,
    "drive_create_folder",
    { name: "Folder", confirm: true },
    env,
    async (_, args) => {
      assert.deepEqual(args, ["filesystem", "create-folder", "/my-files", "Folder", "--json"]);
      return { stdout: "{}" };
    },
  );
});
test("expired session, malformed response and provider errors never return raw output", async () => {
  for (const run of [
    async () => {
      throw Error("token=private-provider-secret");
    },
    async () => ({ stdout: "private-provider-secret" }),
  ])
    await assert.rejects(
      invoke(executorConfig(env), "pass_list_vaults", {}, env, run),
      (error) =>
        !error.message.includes("private-provider-secret") && /native login/.test(error.message),
    );
});
