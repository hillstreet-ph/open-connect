import test from "node:test";
import assert from "node:assert/strict";
import { scanResourceBytes } from "./resource-safety.server.ts";
const fixtures = {
  valid:
    "UEsDBBQAAAAAALs4WV18hCQ8GAAAABgAAAAIAAAAU0tJTEwubWQjIFRlc3Qgc2tpbGwKClNhZmUgdGV4dC5QSwECFAMUAAAAAAC7OFldfIQkPBgAAAAYAAAACAAAAAAAAAAAAAAAgAEAAAAAU0tJTEwubWRQSwUGAAAAAAEAAQA2AAAAPgAAAAAA",
  traversal:
    "UEsDBBQAAAAAALs4WV1uA8/yBgAAAAYAAAALAAAALi4vU0tJTEwubWR1bnNhZmVQSwECFAMUAAAAAAC7OFldbgPP8gYAAAAGAAAACwAAAAAAAAAAAAAAgAEAAAAALi4vU0tJTEwubWRQSwUGAAAAAAEAAQA5AAAALwAAAAAA",
  executable:
    "UEsDBBQAAAAAALs4WV1rzpyJBgAAAAYAAAANAAAAYmluL3NldHVwLmV4ZU1adGVzdFBLAQIUAxQAAAAAALs4WV1rzpyJBgAAAAYAAAANAAAAAAAAAAAAAACAAQAAAABiaW4vc2V0dXAuZXhlUEsFBgAAAAABAAEAOwAAADEAAAAAAA==",
  secret:
    "UEsDBBQAAAAAALs4WV1sAMOSKAAAACgAAAAIAAAAU0tJTEwubWRrZXk9c2stb2MtYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhUEsBAhQDFAAAAAAAuzhZXWwAw5IoAAAAKAAAAAgAAAAAAAAAAAAAAIABAAAAAFNLSUxMLm1kUEsFBgAAAAABAAEANgAAAE4AAAAAAA==",
  json: "UEsDBBQAAAAAALs4WV14VmogBwAAAAcAAAALAAAAcGx1Z2luLmpzb257YnJva2VuUEsBAhQDFAAAAAAAuzhZXXhWaiAHAAAABwAAAAsAAAAAAAAAAAAAAIABAAAAAHBsdWdpbi5qc29uUEsFBgAAAAABAAEAOQAAADAAAAAAAA==",
  symlink:
    "UEsDBBQAAAAAAAAAIQBASv+xDQAAAA0AAAAEAAAAbGluay4uLy4uL291dHNpZGVQSwECFAMUAAAAAAAAACEAQEr/sQ0AAAANAAAABAAAAAAAAAAAAAAA/6EAAAAAbGlua1BLBQYAAAAAAQABADIAAAAvAAAAAAA=",
};
test("static checks never claim antivirus or automatic approval", () => {
  const scan = scanResourceBytes("skill.zip", Buffer.from(fixtures.valid, "base64"));
  assert.equal(scan.state, "needs_review");
  assert.equal(scan.files, 1);
  assert.equal(scan.antivirus, "not_run");
});
test("archives reject traversal, executable files, embedded secrets and symlinks", () => {
  for (const key of ["traversal", "executable", "secret", "json", "symlink"] as const)
    assert.equal(
      scanResourceBytes("plugin.zip", Buffer.from(fixtures[key], "base64")).state,
      "blocked",
      key,
    );
});
test("same-size archive corruption fails checksum verification", () => {
  const bytes = Buffer.from(fixtures.valid, "base64");
  bytes[40] = bytes[40]! ^ 1;
  assert.equal(scanResourceBytes("plugin.zip", bytes).state, "blocked");
});
test("broken JSON and opaque executables are blocked without executing them", () => {
  assert.equal(scanResourceBytes("plugin.json", Buffer.from("{bad")).state, "blocked");
  assert.equal(scanResourceBytes("file.md", Buffer.from("MZpayload")).state, "blocked");
});
