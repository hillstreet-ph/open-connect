import { createHash, randomBytes } from "node:crypto";

export function isClientKey(raw: string): boolean {
  return raw.length <= 256 && (raw.startsWith("oc_live_") || /^sk-oc-[A-Za-z0-9_-]{32}$/.test(raw));
}

export function generateClientKey(modelOnly = false) {
  const prefix = modelOnly ? "sk-oc-" : "oc_live_";
  const raw = `${prefix}${randomBytes(24).toString("base64url")}`;
  return {
    raw,
    hash: createHash("sha256").update(raw).digest("hex"),
    prefix: raw.slice(0, prefix.length + 6),
  };
}
