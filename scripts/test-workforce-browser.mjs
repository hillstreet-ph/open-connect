/* global Bun */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

// Browser interaction fixture only. No production accounts, tokens or network calls.
const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "node_modules/.cache"), { recursive: true });
const directory = await mkdtemp(join(root, "node_modules/.cache/workforce-browser-"));
const require = createRequire(join(root, "services/playwright-worker/package.json"));
const { chromium } = require("playwright");
const entry = join(directory, "fixture.tsx");
const stub = `const run = (name) => async (arg) => structuredClone(await globalThis.__workforceFixture(name, arg?.data ?? {}));
export const listWorkforce=run('list'), workforceOptions=run('options'), setupWorkforce=run('setup'), saveWorkforce=run('save'), activateWorkforce=run('activate'), enableWorkforce=run('enable'), launchWorkforce=run('launch'), getWorkforceChat=run('chat'), workforceActivity=run('activity'), askAgentHelper=run('ask'), saveAgentChat=run('saveChat');`;
await writeFile(
  entry,
  `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorkforceDirectory} from '${join(root, "src/components/workforce-directory.tsx")}';
import {WORKFORCE_TEMPLATES} from '${join(root, "src/lib/workforce.templates.ts")}';
const uid='00000000-0000-4000-8000-000000000001';
const id=(n)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const store={agents:[],versions:[],chats:{}};
globalThis.__workforceStore=store;
globalThis.__workforceFixture=async(name,d)=>{
 if(name==='list')return {agents:store.agents,versions:store.versions,canManage:true};
 if(name==='options')return {projects:[],resources:[],knowledge:[],connections:[]};
 if(name==='setup'){if(store.agents.length)return {added:0};WORKFORCE_TEMPLATES.forEach((t,i)=>{const a=id(i+1),v=id(i+101);store.agents.push({id:a,owner_id:uid,project_id:null,slug:t.slug,department:t.config.department,lead:t.lead,enabled:true,active_version_id:null,updated_at:new Date().toISOString()});store.versions.push({id:v,agent_id:a,number:1,config:t.config,created_at:new Date().toISOString()});});return {added:17};}
 if(name==='activate'){store.agents.find(a=>a.id===d.id).active_version_id=d.versionId;return {activated:true};}
 if(name==='enable'){store.agents.find(a=>a.id===d.id).enabled=d.enabled;return {enabled:d.enabled};}
 if(name==='save'){const v={id:id(500+store.versions.length),agent_id:d.id,number:d.expected+1,config:d.config,created_at:new Date().toISOString()};store.versions.unshift(v);return {agent_id:d.id,version_id:v.id,number:v.number};}
 if(name==='launch'){const a=store.agents.find(a=>a.id===d.id),v=store.versions.find(v=>v.id===a.active_version_id),c=id(900);store.chats[c]={id:c,title:v.config.name,messages:[],revision:0,workforce_agent_id:a.id,workforce_version_id:v.id};return {chatId:c};}
 if(name==='chat'){const c=store.chats[d.chatId];return {chat:c,agent:store.agents.find(a=>a.id===c.workforce_agent_id),version:store.versions.find(v=>v.id===c.workforce_version_id)};}
 if(name==='saveChat'){const c=store.chats[d.id];if(c.revision!==d.revision)throw Error('Fixture revision conflict');c.revision++;c.messages=d.messages;return {id:c.id,revision:c.revision};}
 if(name==='ask')return {reply:'Fixture specialist response with evidence.',action:null};
 if(name==='activity')return {chats:Object.values(store.chats).filter(c=>c.workforce_agent_id===d.id).map(c=>({...c,updated_at:new Date().toISOString()})),events:[]};
 throw Error('Unknown fixture action '+name);
};
function App(){const [location,navigate]=useState({});return <QueryClientProvider client={client}><main className="mx-auto max-w-6xl p-4"><WorkforceDirectory location={location} navigate={navigate}/></main></QueryClientProvider>}
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
createRoot(document.getElementById('app')).render(<App/>);`,
);
let server, browser;
try {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: directory,
    target: "browser",
    format: "esm",
    plugins: [
      {
        name: "isolated-workforce-fixture",
        setup(build) {
          build.onResolve(
            {
              filter:
                /workforce\.functions|agent-helper\.functions|agent-chat\.functions|hooks\/use-auth|^@tanstack\/react-start$|^@tanstack\/react-router$/,
            },
            ({ path }) => ({ path, namespace: "workforce-fixture" }),
          );
          build.onLoad({ filter: /.*/, namespace: "workforce-fixture" }, ({ path }) => ({
            contents: path.includes("use-auth")
              ? `export function useAuth(){return {user:{id:'00000000-0000-4000-8000-000000000001'}}}`
              : path === "@tanstack/react-start"
                ? "export const useServerFn=(fn)=>fn;"
                : path === "@tanstack/react-router"
                  ? `import React from 'react';export function Link({to,search,...props}){return <a href={to} {...props}/>}`
                  : stub,
            loader: "tsx",
            resolveDir: root,
          }));
          build.onResolve({ filter: /^@\// }, ({ path }) => {
            const base = join(root, "src", path.slice(2));
            const file = [base, base + ".ts", base + ".tsx"].find(existsSync);
            return file ? { path: file } : undefined;
          });
        },
      },
    ],
  });
  if (!result.success) throw Error(result.logs.map(String).join("\n"));
  const cssFiles = (await readdir(join(root, ".output/public/assets"))).filter((name) =>
    name.endsWith(".css"),
  );
  assert.ok(cssFiles.length, "Run the production build before the browser fixture");
  const css = (
    await Promise.all(
      cssFiles.map((name) => readFile(join(root, ".output/public/assets", name), "utf8")),
    )
  ).join("\n");
  server = createServer(async (req, res) => {
    res.setHeader(
      "content-type",
      req.url === "/fixture.js"
        ? "text/javascript"
        : req.url === "/style.css"
          ? "text/css"
          : "text/html",
    );
    res.end(
      req.url === "/fixture.js"
        ? await readFile(join(directory, "fixture.js"))
        : req.url === "/style.css"
          ? css
          : '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>',
    );
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath:
      process.env.WORKFORCE_TEST_CHROMIUM ||
      ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].find(
        existsSync,
      ),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );
  await page.goto(origin);
  await page.getByRole("button", { name: "Set up department templates" }).click();
  await page.getByRole("button", { name: "View specialist", exact: true }).first().waitFor();
  assert.equal(
    await page.getByRole("button", { name: "View specialist", exact: true }).count(),
    17,
  );
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Mobile directory must not overflow",
  );
  await page.screenshot({ path: "/tmp/workforce-mobile.png", fullPage: false });
  await page.getByRole("button", { name: "View specialist", exact: true }).first().click();
  await page.getByRole("button", { name: "Activate v1", exact: true }).click();
  await page.screenshot({ path: "/tmp/workforce-profile-mobile.png", fullPage: false });
  await page.getByRole("button", { name: "Launch private chat", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message the specialist" })
    .fill("Prepare a verified plan.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByText("Fixture specialist response with evidence.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Back to specialist", exact: true }).click();
  await page.getByRole("button", { name: "Edit in Builder", exact: true }).click();
  await page
    .getByLabel("Specialist instructions", { exact: true })
    .fill("Revised instructions for a versioned specialist fixture.");
  await page.getByRole("button", { name: "Save private version", exact: true }).click();
  await page.getByRole("button", { name: "Activate v2", exact: true }).click();
  assert.ok(
    await page.evaluate(() => {
      const s = globalThis.__workforceStore;
      return Object.values(s.chats)[0].workforce_version_id !== s.agents[0].active_version_id;
    }),
    "Existing chat stays pinned after activation",
  );
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await page.waitForFunction(() => !globalThis.__workforceStore.agents[0].enabled);
  assert.equal(
    await page.getByRole("button", { name: "Launch private chat", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Back to workforce", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/workforce-desktop.png", fullPage: false });
  assert.deepEqual(errors, []);
  console.log(
    "Browser fixture passed: mobile directory, setup, profile, activation, chat, immutable version pinning, edit and disable. No real provider/account calls.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  await rm(directory, { recursive: true, force: true });
}
