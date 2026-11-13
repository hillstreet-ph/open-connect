import assert from "node:assert/strict";
import test from "node:test";

import { BASELINE_CSP, withSecurityHeaders } from "./security-headers.ts";

test("HTML responses get CSP, anti-clickjacking and baseline headers", () => {
  const response = withSecurityHeaders(
    new Response("<!doctype html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
  );
  assert.equal(response.headers.get("content-security-policy"), BASELINE_CSP);
  assert.match(BASELINE_CSP, /frame-ancestors 'self'/);
  assert.match(BASELINE_CSP, /object-src 'none'/);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
});

test("JSON responses get baseline headers but no document CSP", () => {
  const response = withSecurityHeaders(
    new Response("{}", { status: 201, headers: { "content-type": "application/json" } }),
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("route-set values are preserved and the body is untouched", async () => {
  const response = withSecurityHeaders(
    new Response("<p>ok</p>", {
      headers: { "content-type": "text/html", "x-frame-options": "DENY" },
    }),
  );
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(await response.text(), "<p>ok</p>");
});
