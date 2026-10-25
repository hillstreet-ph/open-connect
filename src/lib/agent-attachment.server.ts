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
  let kind: "pdf" | "text" = "text";
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
    if (!/\.(txt|md|csv|json|log)$/i.test(filename))
      throw new Error(
        "Supported files: text, Markdown, CSV, JSON, logs and text-based PDF. Images and scanned PDFs are not supported yet.",
      );
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Use a UTF-8 text file.");
    }
    if (text.includes("\0")) throw new Error("Binary files cannot be used as text attachments.");
  }
  text = redactDataText(text.trim());
  if (!text) throw new Error("No readable text was found. Scanned PDFs need OCR before attaching.");
  if (text.length > 24000)
    throw new Error("File exceeds 24,000 text characters. Attach a shorter excerpt.");
  return { name: filename, text, kind, size };
}
