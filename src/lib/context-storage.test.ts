import test from "node:test";
import assert from "node:assert/strict";
import { formatStorageBytes, assertOwnFilePath, previewableImage } from "./context-storage.ts";
import { normalizeAuthHeader } from "./connection-auth-header.ts";
import { normalizeRemoteMcpEndpoint } from "./remote-mcp.ts";
test("storage sizes and image preview use safe explicit formats", () => {
  assert.equal(formatStorageBytes(0), "0 B");
  assert.equal(formatStorageBytes(1024), "1.0 KB");
  assert.equal(formatStorageBytes(10 * 1024 * 1024), "10 MB");
  assert.equal(previewableImage("image/png"), true);
  assert.equal(previewableImage("image/svg+xml"), false);
  assert.equal(previewableImage("text/html"), false);
});
test("file actions cannot escape the signed-in user's storage prefix", () => {
  assert.equal(assertOwnFilePath("owner", "owner/files/a.png"), "owner/files/a.png");
  for (const path of ["other/a.png", "owner-other/a.png", "owner/../other/a.png", "owner//a.png"])
    assert.throws(() => assertOwnFilePath("owner", path));
});
test("custom credential headers accept consumer keys but reject protocol overrides", () => {
  assert.equal(normalizeAuthHeader("x-consumer-api-key"), "x-consumer-api-key");
  assert.equal(normalizeAuthHeader(undefined), "X-API-Key");
  for (const header of [
    "Host",
    "Authorization",
    "Cookie",
    "Content-Length",
    "Mcp-Session-Id",
    "x-key\r\nHost",
  ])
    assert.throws(() => normalizeAuthHeader(header));
});
test("IPv6 prefix checks do not reject public hostnames", () => {
  assert.equal(
    normalizeRemoteMcpEndpoint("custom_mcp", "https://feature.example.com/mcp"),
    "https://feature.example.com/mcp",
  );
  assert.throws(() => normalizeRemoteMcpEndpoint("custom_mcp", "https://localhost/mcp"));
  assert.throws(() => normalizeRemoteMcpEndpoint("custom_mcp", "https://[fc00::1]/mcp"));
});
