import { createHash } from "node:crypto";
import { inflateRawSync, gunzipSync } from "node:zlib";
export type ScanReport = {
  state: "blocked" | "needs_review";
  sha256: string;
  files: number;
  findings: string[];
  antivirus: "not_run";
};
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let b = 0; b < 8; b++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function safePath(path: string) {
  if (!path || /(^\/|(^|[/\\])\.\.([/\\]|$)|[:\0])/.test(path))
    throw new Error("Archive contains an unsafe path");
}
export function scanResourceBytes(name: string, bytes: Uint8Array): ScanReport {
  const buffer = Buffer.from(bytes),
    findings: string[] = [];
  let blocked = false,
    files = 0,
    total = 0;
  const inspect = (path: string, body: Buffer) => {
    safePath(path);
    files++;
    total += body.length;
    if (files > 100 || total > 10 * 1024 * 1024)
      throw new Error("Archive exceeds 100 files or 10 MB expanded");
    if (
      /\.(exe|dll|so|dylib|com|scr|msi|pif|docm|xlsm|pptm)$/i.test(path) ||
      body.subarray(0, 2).toString() === "MZ" ||
      body.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70]))
    )
      throw new Error("Executable or macro-enabled payload requires a separate security process");
    const text = body.toString("utf8");
    if (/\.json$/i.test(path)) {
      try {
        JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON manifest");
      }
    }
    if (
      /(?:curl|wget)[^\n]{0,300}\|\s*(?:ba)?sh|powershell[^\n]{0,100}-(?:enc|encodedcommand)|eval\s*\(\s*(?:atob|base64)/i.test(
        text,
      )
    )
      findings.push(`${path}: executable download or obfuscation pattern`);
    if (
      /(?:sk-(?:oc-)?[A-Za-z0-9_-]{20,}|oc_live_[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(
        text,
      )
    )
      throw new Error("Possible embedded secret or private key; remove it before importing");
    if (!body.length) findings.push(`${path}: empty file`);
  };
  try {
    if (
      buffer.subarray(0, 2).toString() === "MZ" ||
      buffer.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70]))
    )
      throw new Error("Executable payload blocked");
    if (/\.zip$/i.test(name) || buffer.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) {
      const end = buffer.lastIndexOf(Buffer.from([80, 75, 5, 6]));
      if (end < 0 || end + 22 > buffer.length)
        throw new Error("ZIP directory is missing or broken");
      if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6))
        throw new Error("Multi-volume ZIP is unsupported");
      const count = buffer.readUInt16LE(end + 10);
      let offset = buffer.readUInt32LE(end + 16);
      if (count > 100 || offset + buffer.readUInt32LE(end + 12) !== end)
        throw new Error("ZIP directory limits or offsets are invalid");
      for (let i = 0; i < count; i++) {
        if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50)
          throw new Error("Broken ZIP directory");
        const flags = buffer.readUInt16LE(offset + 8),
          method = buffer.readUInt16LE(offset + 10),
          expectedCrc = buffer.readUInt32LE(offset + 16),
          compressed = buffer.readUInt32LE(offset + 20),
          size = buffer.readUInt32LE(offset + 24),
          n = buffer.readUInt16LE(offset + 28),
          extra = buffer.readUInt16LE(offset + 30),
          comment = buffer.readUInt16LE(offset + 32),
          local = buffer.readUInt32LE(offset + 42),
          mode = buffer.readUInt32LE(offset + 38) >>> 16;
        if (offset + 46 + n + extra + comment > end) throw new Error("Truncated ZIP directory");
        const nameBytes = buffer.subarray(offset + 46, offset + 46 + n),
          path = nameBytes.toString();
        safePath(path);
        offset += 46 + n + extra + comment;
        if (flags & 1) throw new Error("Encrypted archives cannot be inspected");
        if (mode & 0xf000 && ![0x8000, 0x4000].includes(mode & 0xf000))
          throw new Error("Archive symlinks and special files are blocked");
        if (path.endsWith("/")) continue;
        if (size > 2 * 1024 * 1024 || size > Math.max(compressed, 1) * 100)
          throw new Error("Archive expansion limit exceeded");
        if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50)
          throw new Error("Broken ZIP entry");
        const localNameLength = buffer.readUInt16LE(local + 26),
          start = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
        if (
          start + compressed > buffer.length ||
          !buffer.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes) ||
          buffer.readUInt16LE(local + 8) !== method
        )
          throw new Error("ZIP local and central entries disagree");
        const payload = buffer.subarray(start, start + compressed),
          body =
            method === 0
              ? payload
              : method === 8
                ? inflateRawSync(payload, { maxOutputLength: 2 * 1024 * 1024 })
                : null;
        if (!body || body.length !== size || crc32(body) !== expectedCrc)
          throw new Error("Unsupported or corrupt ZIP entry");
        inspect(path, body);
      }
    } else if (
      /\.(tgz|tar|tar\.gz)$/i.test(name) ||
      buffer.subarray(0, 2).equals(Buffer.from([31, 139]))
    ) {
      const tar =
        /\.(tgz|tar\.gz)$/i.test(name) || buffer.subarray(0, 2).equals(Buffer.from([31, 139]))
          ? gunzipSync(buffer, { maxOutputLength: 10 * 1024 * 1024 })
          : buffer;
      for (let offset = 0; offset + 512 <= tar.length;) {
        const h = tar.subarray(offset, offset + 512);
        if (h.every((b) => b === 0)) break;
        const prefix = h.subarray(345, 500).toString().replace(/\0.*$/, ""),
          base = h.subarray(0, 100).toString().replace(/\0.*$/, ""),
          path = prefix ? `${prefix}/${base}` : base;
        safePath(path);
        const size = parseInt(
            h.subarray(124, 136).toString().replace(/\0.*$/, "").trim() || "0",
            8,
          ),
          expected = parseInt(h.subarray(148, 156).toString().replace(/\0.*$/, "").trim(), 8);
        let sum = 0;
        for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i]!;
        if (
          expected !== sum ||
          !Number.isSafeInteger(size) ||
          size < 0 ||
          offset + 512 + size > tar.length
        )
          throw new Error("Broken TAR header or payload");
        const type = h[156];
        if (type !== 0 && type !== 48 && type !== 53)
          throw new Error("Archive links and extended entries require separate review");
        if (type !== 53) inspect(path, tar.subarray(offset + 512, offset + 512 + size));
        offset += 512 + Math.ceil(size / 512) * 512;
      }
    } else {
      if (!/\.(md|mdx|json|txt|yaml|yml)$/i.test(name))
        throw new Error("Unsupported resource format; use a text manifest or inspected archive");
      inspect(name, buffer);
    }
    if (!files) throw new Error("Package has no inspectable files");
  } catch (error) {
    blocked = true;
    findings.push(error instanceof Error ? error.message : "Package inspection failed");
  }
  return {
    state: blocked ? "blocked" : "needs_review",
    sha256: createHash("sha256").update(buffer).digest("hex"),
    files,
    findings: [...new Set(findings)],
    antivirus: "not_run",
  };
}
