import { redactDataText } from "./data-controls.ts";
import type { ChatAttachment } from "./agent-chat.ts";

export async function extractAgentAttachment(
  name: string,
  bytes: Uint8Array,
): Promise<ChatAttachment> {
  const filename =
    name
      .split(/[/\\]/)
      .pop()
      ?.split("")
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join("")
      .trim() ?? "";
  if (!filename || filename.length > 180 || !bytes.length || bytes.length > 4 * 1024 * 1024)
    throw new Error("Choose a named file up to 4 MB.");
  const size = bytes.length;
  let text: string;
  let kind: "pdf" | "text" | "file" = "text";
  if (/\.pdf$/i.test(filename)) {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error("This file is not a valid PDF.");
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
    try {
      if (pdf.numPages > 30) throw new Error("Use a PDF with at most 30 pages.");
      text = (await extractText(pdf, { mergePages: true })).text;
      kind = "pdf";
    } finally {
      await pdf.loadingTask.destroy();
    }
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0") || !text.trim()) throw new Error("binary attachment");
    } catch {
      kind = "file";
      text =
        "Reference file: " +
        filename +
        " (" +
        String(size) +
        " bytes). This file type is not text-extractable in chat, so it is attached as reference metadata only. Ask the user to describe or paste key content when detailed analysis is needed.";
    }
  }
  text = redactDataText(text.trim());
  if (!text) throw new Error("No readable content was found in this file.");
  if (text.length > 24000)
    throw new Error("File exceeds 24,000 text characters. Attach a shorter excerpt.");
  return { name: filename, text, kind, size };
}
