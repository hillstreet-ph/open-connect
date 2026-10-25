import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { installConfiguration, setupIdentity, setupReadiness } from "./app-setup.ts";
import { setupFiles, setupZip } from "./app-setup-bundle.ts";
import { scanResourceBytes } from "./resource-safety.server.ts";
const templates = Object.fromEntries(
  ["inspect", "server", "agent"].map((name) => [
    name,
    readFileSync(new URL(`./app-setup-templates/${name}.mjs`, import.meta.url), "utf8"),
  ]),
) as { inspect: string; server: string; agent: string };
test("editor configs use their own schemas and contain no provider credentials", () => {
  const vscode = installConfiguration("vscode");
  assert.equal(vscode.filename, ".vscode/mcp.json");
  assert.ok("servers" in vscode.config);
  const cursor = installConfiguration("cursor");
  assert.equal(cursor.filename, ".cursor/mcp.json");
  assert.ok("mcpServers" in cursor.config);
  assert.ok(!JSON.stringify(vscode.config).includes("Authorization"));
  assert.throws(() => setupIdentity("oc_live_this_is_a_secret"));
  assert.throws(() => setupIdentity("My app", "foreign-id"));
  assert.ok(setupIdentity("Task-builder").slug.includes("task-builder"));
});
test("readiness never treats configured/uninspected or empty catalogs as verified execution", () => {
  assert.equal(setupReadiness("configured_unverified", 5, new Date().toISOString()).ready, false);
  assert.equal(setupReadiness("connected", 0, new Date().toISOString()).ready, false);
  assert.equal(setupReadiness("connected", 5, null).ready, false);
  assert.match(
    setupReadiness("connected", 5, new Date().toISOString()).label,
    /execution not tested/,
  );
});
test("setup ZIP has valid inspected entries, no credentials and fixed paths", () => {
  const bundle = setupFiles("My app", undefined, templates);
  const zip = setupZip(bundle.files);
  const scan = scanResourceBytes("setup.zip", zip);
  assert.equal(scan.state, "needs_review", scan.findings.join(";"));
  assert.equal(scan.files, Object.keys(bundle.files).length);
  assert.equal(JSON.parse(bundle.files["setup.json"]!).connection_id, null);
  assert.ok(bundle.files[".gitignore"]!.includes(".env"));
  assert.equal(
    JSON.parse(bundle.files["package.json"]!).dependencies["@modelcontextprotocol/sdk"],
    "1.32.1",
  );
  assert.throws(() => setupZip({ "../escape": "bad" }), /Unsafe/);
});
test("generated local starter initializes, discovers and executes its real read-only MCP tool", () => {
  const root = mkdtempSync(path.join(tmpdir(), "open-connect-starter-"));
  try {
    const bundle = setupFiles("Local app test", undefined, templates);
    for (const [file, content] of Object.entries(bundle.files)) {
      const destination = path.join(root, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }
    symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "junction");
    const result = spawnSync(process.execPath, ["src/test.mjs"], {
      cwd: root,
      timeout: 20000,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /app_status passed/);
    for (const script of ["inspect", "agent"]) {
      const checked = spawnSync(process.execPath, ["--check", `src/${script}.mjs`], {
        cwd: root,
        encoding: "utf8",
      });
      assert.equal(checked.status, 0, checked.stderr);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated agent keeps gateway and integration keys separate and confirms a brokered app call", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "open-connect-agent-"));
  try {
    const id = "11111111-1111-4111-8111-111111111111";
    const bundle = setupFiles("Agent test", id, templates);
    for (const [file, content] of Object.entries(bundle.files)) {
      const destination = path.join(root, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }
    symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "junction");
    writeFileSync(
      path.join(root, "mock.mjs"),
      `import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';let modelCalls=0,appCalls=0;globalThis.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input),headers=new Headers(init?.headers),body=JSON.parse(init?.body||'{}');if(url.includes('/v1/')){assert.equal(headers.get('Authorization'),'Bearer sk-fixture-gateway');modelCalls++;return Response.json({choices:[{message:modelCalls===1?{role:'assistant',content:null,tool_calls:[{id:'fixture-call',type:'function',function:{name:'fixture_read',arguments:'{"marker":"value"}'}}]}:{role:'assistant',content:'Read complete'}}]});}assert.equal(url,'https://open-connect.site/mcp');assert.equal(headers.get('Authorization'),'Bearer oc_live_fixture-integration');if(init?.method==='GET')return new Response(null,{status:405});let result={};if(body.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};else if(body.method==='notifications/initialized')return new Response(null,{status:202});else if(body.method==='tools/call'){if(body.params.name==='list_connection_tools'){assert.equal(body.params.arguments.connection_id,'${id}');result={content:[],structuredContent:{tools:[{name:'fixture_read',inputSchema:{type:'object',properties:{marker:{type:'string'}},additionalProperties:false}}]}};}else{assert.equal(body.params.name,'call_connection_tool');assert.equal(body.params.arguments.connection_id,'${id}');assert.equal(body.params.arguments.confirm,true);assert.equal(body.params.arguments.tool_name,'fixture_read');appCalls++;writeFileSync('evidence.json',JSON.stringify({appCalls,keySeparation:true,selectedConnection:true}));result={content:[{type:'text',text:'fixture result'}]};}}return Response.json({jsonrpc:'2.0',id:body.id,result});};`,
    );
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, ["--import", "./mock.mjs", "src/agent.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        OPEN_CONNECT_MCP_KEY: "oc_live_fixture-integration",
        OPEN_CONNECT_GATEWAY_KEY: "sk-fixture-gateway",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      errors = "",
      asked = false,
      confirmed = false,
      quit = false;
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (!asked && output.includes("You (quit")) {
        asked = true;
        child.stdin.write("Read the fixture\n");
      }
      if (!confirmed && output.includes("Type yes:")) {
        confirmed = true;
        child.stdin.write("yes\n");
      }
      if (!quit && output.includes("Read complete") && output.split("You (quit").length > 2) {
        quit = true;
        child.stdin.write("quit\n");
      }
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk.toString();
    });
    const exit = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Generated agent timed out: " + output + errors));
      }, 15000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    assert.equal(exit, 0, errors);
    assert.ok(confirmed);
    assert.ok(!output.includes("oc_live_fixture-integration"));
    assert.ok(!output.includes("sk-fixture-gateway"));
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "evidence.json"), "utf8")), {
      appCalls: 1,
      keySeparation: true,
      selectedConnection: true,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
