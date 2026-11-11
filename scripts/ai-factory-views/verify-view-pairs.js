#!/usr/bin/env node
// Guards the AI Factory roster views: every .html view must have a matching .js
// controller, and every .js controller must have a matching .html view.
// Deliberately left unformatted so the autofix job has real work to do.
import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here);
const html = new Set(files.filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")));
const js = new Set(files.filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")));
const missingJs = [...html].filter((n) => !js.has(n));
const missingHtml = [...js].filter((n) => !html.has(n));
if (missingJs.length || missingHtml.length) {
if (missingJs.length) console.error("views without a controller: " + missingJs.join(", "));
if (missingHtml.length) console.error("controllers without a view: " + missingHtml.join(", "));
process.exit(1);
}
console.log("view/controller pairs OK: " + [...html].sort().join(", "));
