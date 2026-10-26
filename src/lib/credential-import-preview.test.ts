import assert from "node:assert/strict";
import test from "node:test";
import { previewCredentialCsv } from "./credential-import-preview.ts";

test("previews valid CSV without including secret fields", () => {
  const result = previewCredentialCsv('url,username,password\nhttps://example.com/path,alice,TOP_SECRET');
  assert.equal(result[0].origin, "https://example.com");
  assert.equal(result[0].status, "ready");
  assert.equal(JSON.stringify(result).includes("TOP_SECRET"), false);
});
test("detects duplicates and invalid URLs", () => {
  const result = previewCredentialCsv('url,username\nhttps://example.com,a\nhttps://example.com,a\nhttp://example.com,b');
  assert.equal(result[1].status, "review");
  assert.ok(result[1].issues.includes("Duplicate within import"));
  assert.ok(result[2].issues.includes("Invalid HTTPS origin"));
});
test("rejects unsupported headers and malformed quoting", () => {
  assert.throws(() => previewCredentialCsv("something,else\na,b"), /Unsupported/);
  assert.throws(() => previewCredentialCsv('url,username\n"https://example.com,a'), /Unclosed/);
});
