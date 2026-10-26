import fs from "node:fs";import assert from "node:assert/strict";import vm from "node:vm";
const root=new URL(".",import.meta.url);
const read=f=>fs.readFileSync(new URL(f,root),"utf8");
const manifest=JSON.parse(read("manifest.json"));
assert.equal(manifest.manifest_version,3);
assert.equal(manifest.side_panel.default_path,"panel.html");
for(const file of ["background.js","content.js","panel.js","suggestions.js"]){new vm.Script(read(file),{filename:file});}
assert.match(read("panel.html"),/command-query/);
assert.match(read("panel.html"),/suggestions\.js/);
assert.doesNotMatch(read("content.js"),/fetch\s*\(/);
console.log("Static manifest and JavaScript validation passed.");
