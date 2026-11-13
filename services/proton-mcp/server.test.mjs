import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test(
  "HTTP executor rejects wrong tokens and serves real MCP reads without secret output",
  { timeout: 15000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "proton-mcp-test-"));
    const listener = createServer();
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const binary = join(directory, "fixture-cli");
    await writeFile(
      binary,
      '#!/usr/bin/env node\nconsole.log(JSON.stringify({vaults:[{name:"Fixture",share_id:"share",password:"private-fixture"}]}));\n',
    );
    await chmod(binary, 0o700);
    const token = "fixture-bridge-token-with-at-least-32-characters";
    const processHandle = spawn(
      process.execPath,
      [new URL("server.mjs", import.meta.url).pathname],
      {
        env: {
          PATH: process.env.PATH,
          HOME: directory,
          PROTON_MCP_PROVIDER: "proton_pass",
          PROTON_MCP_ACCOUNT_ID: "fixture-account",
          PROTON_PASS_BINARY: binary,
          PROTON_PASS_SESSION_DIR: directory,
          PROTON_MCP_PORT: String(port),
          PROTON_MCP_BEARER_TOKEN: token,
        },
        stdio: "ignore",
      },
    );
    const url = new URL(`http://127.0.0.1:${port}/mcp`);
    const client = new Client({ name: "fixture-test", version: "1" });
    try {
      let unauthorized;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          unauthorized = await fetch(url);
          break;
        } catch {
          await delay(50);
        }
      }
      assert.equal(unauthorized?.status, 401);
      assert.equal((await fetch(url, { headers: { authorization: "Bearer wrong" } })).status, 401);
      await client.connect(
        new StreamableHTTPClientTransport(url, {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
      const catalog = await client.listTools();
      assert.ok(catalog.tools.every((tool) => tool.annotations.readOnlyHint));
      assert.deepEqual(
        (await client.callTool({ name: "get_profile", arguments: {} })).structuredContent,
        { id: "fixture-account" },
      );
      const result = await client.callTool({ name: "pass_list_vaults", arguments: {} });
      assert.deepEqual(result.structuredContent, {
        vaults: [{ name: "Fixture", share_id: "share" }],
      });
      assert.ok(!JSON.stringify(result).includes("private-fixture"));
      const denied = await client.callTool({
        name: "pass_create_vault",
        arguments: { name: "Denied", confirm: true },
      });
      assert.equal(denied.isError, true);
      assert.deepEqual(
        (await client.callTool({ name: "get_profile", arguments: {} })).structuredContent,
        { id: "fixture-account" },
      );
    } finally {
      await client.close();
      processHandle.kill();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
