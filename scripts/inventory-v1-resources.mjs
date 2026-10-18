#!/usr/bin/env node
// Read-only V1 resource inventory. Does not import, verify or publish resources.
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(process.argv[2] ?? "../v1-open-connect");
const out = [];
const skip = new Set([".git", "node_modules", "dist", ".next", ".cache"]);
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!item.isFile()) continue;
    const path = relative(root, full).replaceAll("\\", "/");
    const candidate =
      path.startsWith(".skills/") ||
      /^supabase\/migrations\/.*seed.*\.sql$/i.test(path) ||
      [
        "supabase/functions/oc-api/index.ts",
        "supabase/functions/oc-mcp/index.ts",
        "supabase/functions/oc-plugin/index.ts",
      ].includes(path);
    if (!candidate) continue;
    const bytes = await readFile(full);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const type = path.startsWith(".skills/")
      ? "skill-file"
      : path.endsWith(".sql")
        ? "legacy-seed"
        : "legacy-function";
    out.push({
      path,
      type,
      size: bytes.length,
      sha256: digest,
      review_state: "pending",
      publishable: false,
    });
  }
}
await stat(root);
await walk(root);
out.sort((a, b) => a.path.localeCompare(b.path));
process.stdout.write(
  JSON.stringify({ source: "v1-open-connect", count: out.length, entries: out }, null, 2) + "\n",
);
