import { parse, type DefaultTreeAdapterMap } from "parse5";

type HtmlNode = DefaultTreeAdapterMap["node"];
const OMIT = new Set([
  "script",
  "style",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "nav",
  "header",
  "footer",
  "noscript",
]);
function children(node: HtmlNode): HtmlNode[] {
  return "childNodes" in node ? node.childNodes : [];
}
function findTag(root: HtmlNode, tag: string): HtmlNode | undefined {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if ("tagName" in node && node.tagName === tag) return node;
    const nodes = children(node);
    for (let index = nodes.length - 1; index >= 0; index--) pending.push(nodes[index]!);
  }
  return undefined;
}
function plainText(root: HtmlNode): string {
  const pending = [root];
  const parts: string[] = [];
  while (pending.length) {
    const node = pending.pop()!;
    if ("tagName" in node && OMIT.has(node.tagName)) continue;
    if (node.nodeName === "#text" && "value" in node) parts.push(node.value);
    const nodes = children(node);
    for (let index = nodes.length - 1; index >= 0; index--) pending.push(nodes[index]!);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function escapeText(text: string): string {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  return text.replace(/[&<>]/g, (character) => escaped[character]!);
}

/** Parse HTML as data and emit escaped text; source markup and attributes are never emitted. */
export function websiteText(content: string): string {
  const document = parse(content);
  const title = findTag(document, "title");
  const body = findTag(document, "body");
  const heading = title ? plainText(title) : "";
  const text = body ? plainText(body) : "";
  if (!text)
    throw new Error("Website has no readable document text. Import a public document URL instead.");
  return `# ${escapeText(heading || "Imported website")}\n\n${escapeText(text)}`;
}

/** Converted web pages have a supported text filename regardless of their original URL path. */
export function prepareImportedDocument(filename: string, content: string) {
  return /<!doctype\s+html|<(?:html|head|body)[\s>]/i.test(content)
    ? { filename: "website-guide.md", text: websiteText(content) }
    : { filename, text: content };
}
