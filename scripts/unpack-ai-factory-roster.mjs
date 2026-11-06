#!/usr/bin/env node
/**
 * Unpacks the AI Factory roster bundle into public/ai-factory/roster/.
 *
 * The roster is a static, self-contained site (9 pages, data JSON, agent
 * avatars). It is committed as a single zip so the repository stays readable
 * and the build does not carry 120+ generated files in version control.
 *
 * Runs automatically via the `prebuild` script. Safe to run repeatedly: the
 * target directory is replaced only after a successful extraction.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const archive = join(root, "scripts", "ai-factory-roster.zip");
const target = join(root, "public", "ai-factory", "roster");
const staging = `${target}.unpacking`;

if (!existsSync(archive)) {
  console.log("[ai-factory] no roster bundle present, skipping unpack");
  process.exit(0);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

try {
  execFileSync("unzip", ["-q", "-o", archive, "-d", staging], { stdio: "inherit" });
} catch (error) {
  rmSync(staging, { recursive: true, force: true });
  console.error("[ai-factory] failed to unpack roster bundle", error);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
renameSync(staging, target);
console.log("[ai-factory] roster unpacked to public/ai-factory/roster");
