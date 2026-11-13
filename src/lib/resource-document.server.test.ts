import test from "node:test";
import assert from "node:assert/strict";
import { prepareImportedDocument } from "./website-text.ts";
import { scanResourceBytes } from "./resource-safety.server.ts";

test("website paths without a document extension become inspectable guide documents", () => {
  for (const filename of ["example-domains", "index.html", "page.php"]) {
    const document = prepareImportedDocument(
      filename,
      "<!doctype html><html><head><title>Example &amp; guide</title></head><body><nav>Menu</nav><h1>Main</h1><p>Readable information.</p></body></html>",
    );
    assert.equal(document.filename, "website-guide.md");
    assert.equal(document.text, "# Example &amp; guide\n\nMain Readable information.");
    assert.equal(
      scanResourceBytes(document.filename, new TextEncoder().encode(document.text)).state,
      "needs_review",
    );
  }
});
test("malformed tags and encoded markup never reappear as raw HTML", () => {
  const document = prepareImportedDocument(
    "page.html",
    '<html><head><title>&lt;img src=x onerror=alert(1)&gt;</title></head><body><scr<script>ipt>alert(1)</scr<script>ipt><script>privateScript()</script><style>privateStyle()</style><p>&lt;script&gt;literal&lt;/script&gt; &amp; text</p><img src=x onerror="privateHandler()"><iframe src="https://untrusted.example">privateFrame</iframe></body></html>',
  );
  assert.ok(!document.text.includes("<"));
  assert.ok(!document.text.includes("privateScript"));
  assert.ok(!document.text.includes("privateStyle"));
  assert.ok(!document.text.includes("privateHandler"));
  assert.ok(!document.text.includes("privateFrame"));
  assert.ok(document.text.includes("&lt;script&gt;literal&lt;/script&gt;"));
});
test("plain manifests retain their original bytes and format checks", () => {
  const content = '{"name":"Private draft"}\n';
  assert.deepEqual(prepareImportedDocument("plugin.json", content), {
    filename: "plugin.json",
    text: content,
  });
  assert.throws(
    () =>
      prepareImportedDocument(
        "empty.html",
        "<html><body><script>onlyScript()</script></body></html>",
      ),
    /no readable/,
  );
});
