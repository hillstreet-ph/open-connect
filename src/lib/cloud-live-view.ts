const LIVE_VIEW_KEYS = new Set([
  "viewer_url",
  "live_url",
  "live_view_url",
  "liveviewurl",
  "streaming_url",
  "stream_url",
  "debugger_url",
  "debuggerfullscreenurl",
  "vnc_url",
  "preview_url",
]);

/**
 * Finds interactive live-view links (viewer, stream, VNC) in a provider tool
 * result so the user can watch or take over a cloud session. Only HTTPS links
 * are returned; CDP websocket URLs are deliberately excluded.
 */
export function extractLiveViewUrls(result: unknown, limit = 5): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (found.size >= limit || depth > 8 || value === null || value === undefined) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          visit(JSON.parse(trimmed), depth + 1);
        } catch {
          // Plain text content; nothing to parse.
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "string" && LIVE_VIEW_KEYS.has(key.toLowerCase())) {
        try {
          const url = new URL(item);
          if (url.protocol === "https:" && !url.username && !url.password)
            found.add(url.toString());
        } catch {
          // Not a URL.
        }
      } else {
        visit(item, depth + 1);
      }
    }
  };
  visit(result, 0);
  return [...found].slice(0, limit);
}

/** The TinyFish task preview is observation-only, and never accepts arbitrary iframe origins. */
export function browserPreviewUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["tinyfish.io", "tinyfish.ai"].some((host) => url.hostname.endsWith(`.${host}`))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
