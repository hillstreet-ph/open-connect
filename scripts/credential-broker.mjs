#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  readFileSync(resolve(root, "credentials/environment-contract.json"), "utf8"),
);

export function resolveProfile(profileName, source = process.env) {
  const profile = contract.profiles[profileName];
  if (!profile) throw new Error(`Unknown credential profile: ${profileName}`);
  const required = profile.required ?? [];
  const requiredAny = profile.requiredAny ?? [];
  const optional = profile.optional ?? [];
  const missing = required.filter((name) => !source[name]);
  const missingGroups = requiredAny.filter((group) => !group.some((name) => source[name]));
  const selected = new Set(optional.filter((name) => source[name]));
  required.filter((name) => source[name]).forEach((name) => selected.add(name));
  requiredAny.forEach((group) => {
    const name = group.find((candidate) => source[candidate]);
    if (name) selected.add(name);
  });
  return {
    profile: profileName,
    ready: missing.length === 0 && missingGroups.length === 0,
    selected: [...selected],
    missing,
    missingAny: missingGroups,
  };
}

function publicReport(result) {
  return {
    profile: result.profile,
    ready: result.ready,
    injectedNames: result.selected,
    missing: result.missing,
    missingAny: result.missingAny,
    valuesExposed: false,
  };
}

function childEnvironment(result) {
  const runtimeNames = [
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "TERM",
    "TMPDIR",
    "NODE_ENV",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ];
  const safe = Object.fromEntries(
    runtimeNames.filter((name) => process.env[name]).map((name) => [name, process.env[name]]),
  );
  safe.PATH ??= "";
  safe.HOME ??= "";
  safe.LANG ??= "C.UTF-8";
  safe.NODE_ENV ??= "production";
  for (const name of result.selected) safe[name] = process.env[name];
  return safe;
}

async function main() {
  const [command = "check", profileName, separator, ...args] = process.argv.slice(2);
  if (!profileName || !contract.profiles[profileName]) {
    console.error(
      `Usage: credential-broker.mjs check <profile> | exec <profile> -- <command> [args...]`,
    );
    process.exitCode = 2;
    return;
  }
  const result = resolveProfile(profileName);
  if (command === "check") {
    console.log(JSON.stringify(publicReport(result), null, 2));
    process.exitCode = result.ready ? 0 : 3;
    return;
  }
  if (command !== "exec" || separator !== "--" || args.length === 0) {
    console.error("The exec form requires `-- <command> [args...]`.");
    process.exitCode = 2;
    return;
  }
  if (!result.ready) {
    console.error(JSON.stringify(publicReport(result), null, 2));
    process.exitCode = 3;
    return;
  }
  const child = spawn(args[0], args.slice(1), {
    cwd: process.cwd(),
    env: childEnvironment(result),
    stdio: "inherit",
  });
  child.on("error", (error) => {
    console.error(`Credential-broker execution failed: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
