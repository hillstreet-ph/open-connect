export type DetectedResourceType =
  | "skill"
  | "mcp"
  | "tool"
  | "plugin"
  | "agent"
  | "prompt"
  | "guide";

export type DetectResult = {
  resource_type: DetectedResourceType;
  name: string;
  slug: string;
  description: string;
  confidence: "high" | "medium" | "low";
  signals: string[];
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "resource"
  );
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "Untitled resource";
}

/** Heuristic detection from file name + optional text content (md/json/manifest). */
export function detectResourceMeta(input: {
  filename: string;
  contentText?: string;
}): DetectResult {
  const filename = input.filename.toLowerCase();
  const text = (input.contentText ?? "").toLowerCase();
  const signals: string[] = [];

  let resource_type: DetectedResourceType = "skill";
  let confidence: DetectResult["confidence"] = "low";

  if (
    /skill\.md$|skills?[/\\]|\.skill\.|skill[-_]/.test(filename) ||
    /# skill\b|name:\s*.+\ndescription:/i.test(input.contentText ?? "") ||
    text.includes("skill.md")
  ) {
    resource_type = "skill";
    confidence = "high";
    signals.push("skill pattern");
  } else if (
    /mcp|model[-_]?context/.test(filename) ||
    text.includes("mcpservers") ||
    text.includes("@modelcontextprotocol") ||
    text.includes("tools/list")
  ) {
    resource_type = "mcp";
    confidence = "high";
    signals.push("mcp pattern");
  } else if (
    /plugin|chatgpt.*plugin|openapi\.json/.test(filename) ||
    (text.includes("openapi") && text.includes("plugin"))
  ) {
    resource_type = "plugin";
    confidence = "medium";
    signals.push("plugin pattern");
  } else if (/agent|hermes|crewai|autogen/.test(filename) || /\bagents?\b/.test(text.slice(0, 500))) {
    resource_type = "agent";
    confidence = "medium";
    signals.push("agent pattern");
  } else if (/prompt|system[-_]?prompt|\.prompt\./.test(filename) || text.includes("you are a")) {
    resource_type = "prompt";
    confidence = "medium";
    signals.push("prompt pattern");
  } else if (/guide|readme|how[-_]?to|tutorial/.test(filename)) {
    resource_type = "guide";
    confidence = "medium";
    signals.push("guide pattern");
  } else if (/tool|function[-_]?call|actions?\.json/.test(filename)) {
    resource_type = "tool";
    confidence = "medium";
    signals.push("tool pattern");
  } else if (filename.endsWith(".zip") || filename.endsWith(".tgz") || filename.endsWith(".tar.gz")) {
    resource_type = "skill";
    confidence = "low";
    signals.push("archive default → skill");
  } else {
    signals.push("default → skill");
  }

  let description = "";
  const md = input.contentText ?? "";
  const para = md
    .split(/\n\n+/)
    .map((p) => p.replace(/^#+\s*/, "").trim())
    .find((p) => p.length > 20 && !p.startsWith("---"));
  if (para) description = para.slice(0, 280);

  const name = titleFromFilename(input.filename);
  return {
    resource_type,
    name,
    slug: slugify(input.filename),
    description: description || `Uploaded ${resource_type} package: ${input.filename}`,
    confidence,
    signals,
  };
}

export function isArchiveFilename(name: string): boolean {
  return /\.(zip|tgz|tar\.gz|tar)$/i.test(name);
}
