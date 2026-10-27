import assert from "node:assert/strict";
import test from "node:test";
import { previewCredentialCsv, previewCredentialJson } from "./credential-import-preview.ts";

test("previews valid CSV without including private field values", () => {
  const result = previewCredentialCsv(
    "url,username,password\nhttps://example.com/path,alice,synthetic_fixture_value",
  );
  assert.equal(result[0]!.origin, "https://example.com");
  assert.equal(result[0]!.status, "ready");
  assert.equal(JSON.stringify(result).includes("synthetic_fixture_value"), false);
});

test("detects duplicates and invalid URLs", () => {
  const result = previewCredentialCsv(
    "url,username\nhttps://example.com,a\nhttps://example.com,a\nhttp://example.com,b",
  );
  assert.equal(result[1]!.status, "review");
  assert.ok(result[1]!.issues.includes("Duplicate within import"));
  assert.ok(result[2]!.issues.includes("Invalid HTTPS origin"));
});

test("rejects unsupported headers and malformed quoting", () => {
  assert.throws(() => previewCredentialCsv("something,else\na,b"), /Unsupported/);
  assert.throws(() => previewCredentialCsv('url,username\n"https://example.com,a'), /Unclosed/);
});

test("rejects records with extra columns", () => {
  assert.throws(
    () =>
      previewCredentialCsv("url,username,password\nhttps://example.com,alice,fixture,unexpected"),
    /column count/,
  );
});

test("rejects trailing characters after a closed quoted cell", () => {
  assert.throws(
    () => previewCredentialCsv('url,username\n"https://example.com"evil,alice'),
    /Invalid CSV/,
  );
});

test("rejects duplicate headers", () => {
  assert.throws(
    () => previewCredentialCsv("url,URL,username\nhttps://example.com,https://other.example,alice"),
    /Duplicate header/,
  );
});

test("masks account metadata and detects existing credentials", () => {
  const result = previewCredentialCsv(
    "url,username,password\nhttps://example.com,alice,private_fixture",
    [
      {
        website: "https://example.com/login",
        username: "alice",
        email_address: null,
        secret_type: "password",
      },
    ],
  );
  assert.equal(result[0]!.account, "••••");
  assert.ok(result[0]!.issues.includes("Existing credential requires review"));
  assert.doesNotMatch(JSON.stringify(result), /alice|private_fixture/);
});

test("reviews embedded URL credentials and spreadsheet formulas without echoing them", () => {
  const result = previewCredentialCsv(
    "url,username\nhttps://user:private_fixture@example.com/path?token=hidden,=DANGEROUS()",
  );
  assert.equal(result[0]!.origin, "https://example.com");
  assert.equal(result[0]!.issues.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /private_fixture|hidden|DANGEROUS/);
});

test("does not merge case-sensitive account names", () => {
  const result = previewCredentialCsv(
    "url,username\nhttps://example.com,Alice\nhttps://example.com,alice",
  );
  assert.equal(result[1]!.status, "ready");
});

test("enforces CSV row limit even without a final newline", () => {
  const rows = Array.from({ length: 20001 }, (_, i) => "https://example.com,user" + i);
  assert.throws(() => previewCredentialCsv(["url,username", ...rows].join("\n")), /Too many rows/);
});

test("JSON preview omits secrets, masks accounts and rejects nested exports", () => {
  const result = previewCredentialJson(
    JSON.stringify([
      {
        url: "https://example.com/path",
        username: "alice",
        password: "private_fixture",
        type: "password",
      },
      { url: "https://example.com", username: "alice", type: "password" },
    ]),
  );
  assert.equal(result.length, 2);
  assert.ok(result[1]!.issues.includes("Duplicate within import"));
  assert.doesNotMatch(JSON.stringify(result), /alice|private_fixture/);
  assert.throws(
    () => previewCredentialJson('[{"url":"https://example.com","username":"a","login":{}}]'),
    /flat/,
  );
  assert.throws(() => previewCredentialJson('{"password":"private_fixture"}'), /array/);
  assert.throws(() => previewCredentialJson("private_fixture"), /^Error: Invalid JSON$/);
});

test("bounds JSON cells, count, types, and CSV byte length", () => {
  assert.throws(
    () =>
      previewCredentialJson(
        JSON.stringify([
          { url: "https://example.com", username: "a", password: "x".repeat(16385) },
        ]),
      ),
    /Cell too long/,
  );
  assert.throws(() => previewCredentialJson(JSON.stringify(Array(20001).fill({}))), /Too many rows/);
  assert.throws(() => previewCredentialJson('[{"url":5,"username":"a"}]'), /string/);
  assert.throws(() => previewCredentialCsv("x".repeat(10000001)), /too large/);
});

test("recognizes Proton Pass login exports with separate email and username", () => {
  const csv = [
    "type,name,url,email,username,password,note,totp,vault",
    "login,Example,https://example.com,alice@example.com,,fixture-secret,fixture-note,fixture-totp,Personal",
    "login,Work,https://work.example.com,bob@example.com,bob,fixture-secret,,,Work",
    "alias,Alias,https://alias.example.com,alias@example.com,,,,,Personal",
  ].join("\n");
  const result = previewCredentialCsv(csv);
  assert.deepEqual(result.map((row) => row.kind), ["password", "password", "unknown"]);
  assert.equal(result[0]!.status, "ready");
  assert.equal(result[1]!.status, "ready");
  assert.equal(result[2]!.status, "review");
  assert.doesNotMatch(JSON.stringify(result), /alice|bob|fixture-secret|fixture-note|fixture-totp/);
});

test("flags Proton multi-URL entries and detects the email account against existing records", () => {
  const result = previewCredentialCsv(
    'type,name,url,email,username,password,vault\nlogin,Example,"https://example.com, https://other.example",alice@example.com,,fixture,Personal',
    [{ website: "https://example.com", username: null, email_address: "alice@example.com", secret_type: "password" }],
  );
  assert.ok(result[0]!.issues.includes("Multiple websites require review"));
  assert.ok(result[0]!.issues.includes("Existing credential requires review"));
});

test("accepts a realistic file larger than the former two megabyte limit", () => {
  const csv = "url,username\n" + Array.from({ length: 6000 }, (_, i) => `https://example.com,user${i}${"x".repeat(320)}`).join("\n");
  assert.ok(new TextEncoder().encode(csv).length > 2_000_000);
  assert.equal(previewCredentialCsv(csv).length, 6000);
});
