// Pure, offline converter for user-provided ChatGPT export data.
// No network access, session scraping, or automatic uploads.
function safeName(value) {
  return String(value || "conversation")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80) || "conversation";
}

function extractText(message) {
  const content = message?.content;
  if (!content) return "";
  if (Array.isArray(content.parts)) {
    return content.parts.filter((part) => typeof part === "string").join("\n\n");
  }
  if (typeof content.text === "string") return content.text;
  return "";
}

export function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== "object") {
    throw new Error("Invalid conversation");
  }
  const nodes = Object.values(conversation.mapping || {});
  const messages = nodes
    .map((node) => node?.message)
    .filter((message) => message && ["user", "assistant"].includes(message.author?.role))
    .map((message) => ({
      id: String(message.id || ""),
      role: message.author.role,
      text: extractText(message),
      timestamp: Number.isFinite(message.create_time) ? message.create_time : null,
    }))
    .filter((message) => message.text.trim())
    .sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity));
  return {
    id: String(conversation.id || ""),
    title: String(conversation.title || "Untitled conversation"),
    messages,
  };
}

export function exportConversation(conversation, format = "md") {
  const normalized = normalizeConversation(conversation);
  if (!["md", "txt", "json"].includes(format)) throw new Error("Unsupported format");
  const filename = `${safeName(normalized.title)}-${safeName(normalized.id || "export")}.${format}`;
  if (format === "json") {
    return { filename, content: JSON.stringify(normalized, null, 2), mime: "application/json" };
  }
  const lines = format === "md" ? [`# ${normalized.title}`, ""] : [normalized.title, ""];
  for (const message of normalized.messages) {
    lines.push(format === "md" ? `## ${message.role}` : `[${message.role}]`);
    lines.push("", message.text, "");
  }
  return { filename, content: lines.join("\n"), mime: "text/plain;charset=utf-8" };
}

export function exportResponse({ text, role = "assistant", title = "response", format = "md" }) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Response text required");
  if (!["user", "assistant"].includes(role)) throw new Error("Invalid role");
  const conversation = {
    id: "single",
    title,
    mapping: {
      single: {
        message: {
          id: "single",
          author: { role },
          content: { parts: [text] },
          create_time: 0,
        },
      },
    },
  };
  return exportConversation(conversation, format);
}

export function exportHistory(conversations, format = "md") {
  if (!Array.isArray(conversations)) throw new Error("Expected conversations array");
  return conversations.map((conversation) => exportConversation(conversation, format));
}
