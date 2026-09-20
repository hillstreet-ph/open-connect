#!/usr/bin/env node
import { appendFile, chmod, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";

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

function resolverEnvironment(source) {
  const runtimeNames = [
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ];
  const environment = Object.fromEntries(
    runtimeNames
      .map((name) => [name, source[name] ?? process.env[name]])
      .filter(([, value]) => value),
  );
  for (const name of ["PROTON_PASS_KEY_PROVIDER", "PROTON_PASS_ENCRYPTION_KEY"]) {
    if (source[name]) environment[name] = source[name];
  }
  return environment;
}

function resolveFromAdapter(name, source) {
  const adapter = source.OPEN_CONNECT_CREDENTIAL_RESOLVER;
  const reference = contract.bindings?.[name];
  if (!adapter || !reference) return undefined;
  if (!isAbsolute(adapter)) {
    throw new Error("OPEN_CONNECT_CREDENTIAL_RESOLVER must be an absolute executable path");
  }
  const response = spawnSync(adapter, ["resolve", reference, name], {
    encoding: "utf8",
    env: resolverEnvironment(source),
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  if (response.error || response.status !== 0) return undefined;
  try {
    const payload = JSON.parse(response.stdout);
    return typeof payload?.value === "string" && payload.value.length > 0
      ? payload.value
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveProfileWithAdapter(profileName, source = process.env) {
  const hydrated = { ...source };
  const initial = resolveProfile(profileName, hydrated);
  for (const name of initial.missing) {
    const value = resolveFromAdapter(name, source);
    if (value) hydrated[name] = value;
  }
  for (const group of initial.missingAny) {
    for (const name of group) {
      const value = resolveFromAdapter(name, source);
      if (value) {
        hydrated[name] = value;
        break;
      }
    }
  }
  const result = resolveProfile(profileName, hydrated);
  Object.defineProperty(result, "source", { value: hydrated, enumerable: false });
  return result;
}

async function writeAudit(result, command, source = process.env) {
  const auditPath = source.OPEN_CONNECT_CREDENTIAL_AUDIT_FILE
    ? resolve(source.OPEN_CONNECT_CREDENTIAL_AUDIT_FILE)
    : resolve(homedir(), ".local/state/open-connect/credential-access.jsonl");
  await mkdir(dirname(auditPath), { recursive: true, mode: 0o700 });
  await appendFile(
    auditPath,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      actor: source.OPEN_CONNECT_ACTOR ?? "local-operator",
      profile: result.profile,
      injectedNames: result.selected,
      command: basename(command),
      decision: result.ready ? "allow" : "deny",
      valuesExposed: false,
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(auditPath, 0o600);
}

function childEnvironment(result, source = process.env) {
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
    runtimeNames.filter((name) => source[name]).map((name) => [name, source[name]]),
  );
  safe.PATH ??= "";
  safe.HOME ??= "";
  safe.LANG ??= "C.UTF-8";
  safe.NODE_ENV ??= "production";
  for (const name of result.selected) safe[name] = source[name];
  return safe;
}

async function main() {
  let [command = "check", profileName, separator, ...args] = process.argv.slice(2);
  if (command === "exec-auto") {
    if (profileName !== "--" || !separator) {
      console.error("The exec-auto form requires `-- <command> [args...]`.");
      process.exitCode = 2;
      return;
    }
    args = [separator, ...args];
    profileName = contract.commandProfiles?.[basename(args[0])];
    separator = "--";
    command = "exec";
  }
  if (!profileName || !contract.profiles[profileName]) {
    console.error(
      `Usage: credential-broker.mjs check <profile> | exec <profile> -- <command> [args...] | exec-auto -- <command> [args...]`,
    );
    process.exitCode = 2;
    return;
  }
  const result = resolveProfileWithAdapter(profileName);
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
    await writeAudit(result, args[0] ?? "none");
    console.error(JSON.stringify(publicReport(result), null, 2));
    process.exitCode = 3;
    return;
  }
  await writeAudit(result, args[0]);
  const child = spawn(args[0], args.slice(1), {
    cwd: process.cwd(),
    env: childEnvironment(result, result.source),
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
