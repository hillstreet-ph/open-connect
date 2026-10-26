import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";
const root = new URL(".", import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, root), "utf8");
const manifest = JSON.parse(read("manifest.json"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.side_panel.default_path, "panel.html");
assert.deepEqual(manifest.permissions.sort(), ["sidePanel", "storage"].sort());
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
for (const file of ["background.js", "panel.js", "suggestions.js"]) {
  new vm.Script(read(file), { filename: file });
}
const html = read("panel.html");
assert.match(html, /command-query/);
assert.match(html, /command-results/);
assert.match(html, /suggestions\.js/);
assert.match(html, /panel\.js/);
assert.match(html, /response-text/);
assert.match(html, /response-format/);
assert.match(html, /export\/response-download\.mjs/);
assert.match(read("export/response-download.mjs"), /exportResponse/);
const suggestions = read("suggestions.js");
assert.match(suggestions, /navigator\.clipboard\.writeText/);
assert.doesNotMatch(suggestions, /fetch\s*\(/);
console.log("Static manifest, JavaScript and privacy invariants passed.");
