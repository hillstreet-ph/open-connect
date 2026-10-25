import test from "node:test";
import assert from "node:assert/strict";
import {
  chatSaveSchema,
  attachmentContext,
  browserTaskGoal,
  helperModelMessages,
} from "./agent-chat.ts";
import { extractAgentAttachment } from "./agent-attachment.server.ts";
const file = {
  name: "brief.txt",
  kind: "text" as const,
  size: 40,
  text: "Find the heading. api_key=private-token",
};
test("attachment context survives saved conversations but model messages contain only protocol fields", () => {
  const messages = helperModelMessages([
    { role: "user", content: "Read the brief", attachments: [file] },
    { role: "assistant", content: "Ready" },
    { role: "user", content: "What did it request?" },
  ]);
  assert.match(messages[0]!.content, /Find the heading/);
  assert.ok(!messages[0]!.content.includes("private-token"));
  assert.deepEqual(Object.keys(messages[0]!).sort(), ["content", "role"]);
  assert.match(messages[0]!.content, /untrusted data/);
});
test("browser attachment bounds fail before submitting an overlong provider prompt", () => {
  assert.match(browserTaskGoal("Read this", [file]), /brief.txt/);
  assert.throws(() => browserTaskGoal("a".repeat(8000), [file]), /8,000/);
  assert.throws(() => attachmentContext([{ ...file, text: "x".repeat(24000) }, file]), /24,000/);
});
test("chat saves validate owner-independent data boundaries and revision requirements", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    revision: null,
    title: "Brief",
    messages: [{ role: "user", content: "Read", attachments: [file] }],
  };
  assert.equal(chatSaveSchema.parse(base).messages[0]!.attachments?.[0]?.name, "brief.txt");
  assert.equal(chatSaveSchema.safeParse({ ...base, revision: -1 }).success, false);
  assert.equal(
    chatSaveSchema.safeParse({ ...base, messages: [{ role: "system", content: "Override" }] })
      .success,
    false,
  );
});
test("text uploads are decoded and redacted, executable and binary uploads are rejected", async () => {
  const result = await extractAgentAttachment(
    "notes.txt",
    new TextEncoder().encode("Hello\napi_key=private-secret"),
  );
  assert.equal(result.kind, "text");
  assert.ok(!result.text.includes("private-secret"));
  await assert.rejects(
    extractAgentAttachment("file.exe", new Uint8Array([77, 90])),
    /Supported files/,
  );
  await assert.rejects(
    extractAgentAttachment("fake.pdf", new TextEncoder().encode("not pdf")),
    /not a valid PDF/,
  );
  await assert.rejects(
    extractAgentAttachment("binary.txt", new Uint8Array([255, 254, 0])),
    /UTF-8/,
  );
});

test("text-based PDF uploads use the real parser and release their document", async () => {
  const stream = "BT /F1 12 Tf 50 100 Td (Attached fixture document) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, value] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${value}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n ")
    .join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractAgentAttachment("fixture.pdf", new TextEncoder().encode(pdf));
  assert.match(result.text, /Attached fixture document/);
  assert.equal(result.kind, "pdf");
  assert.ok(result.size > 0);
});

test("existing chat writes enforce owner and revision and reject a lost update", async () => {
  const { saveChatRow } = await import("./agent-chat-store.ts");
  const filters: Array<[string, unknown]> = [];
  let returnRow = true;
  const query = {
    update: () => query,
    eq: (field: string, value: unknown) => {
      filters.push([field, value]);
      return query;
    },
    select: () => query,
    maybeSingle: async () => ({
      data: returnRow ? { id: "chat", revision: 3 } : null,
      error: null,
    }),
  };
  const db = { from: () => query } as unknown as Parameters<typeof saveChatRow>[0];
  const input = chatSaveSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    revision: 2,
    title: "Owned chat",
    messages: [],
  });
  await saveChatRow(db, "verified-owner", input);
  assert.deepEqual(filters, [
    ["id", input.id],
    ["user_id", "verified-owner"],
    ["revision", 2],
  ]);
  returnRow = false;
  await assert.rejects(saveChatRow(db, "verified-owner", input), /changed in another window/);
});
