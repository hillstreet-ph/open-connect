import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute } from "node:path";

const execute = promisify(execFile);
const string = (value, pattern = /^[^\x00-\x1f]{1,200}$/u) => {
  if (typeof value !== "string" || !pattern.test(value) || value.startsWith("-"))
    throw Error("Invalid operation argument.");
  return value;
};
const remotePath = (value) => {
  const path = string(value ?? "/my-files");
  if (!/^\/my-files(?:\/|$)/.test(path) || path.split("/").some((s) => s === "." || s === ".."))
    throw Error("Only absolute /my-files paths are supported.");
  return path;
};
const name = (value) => {
  const result = string(value, /^[^/\\\x00-\x1f]{1,100}$/u);
  if ([".", ".."].includes(result)) throw Error("Invalid name.");
  return result;
};
const id = (value) => string(value, /^[A-Za-z0-9_=-]{1,200}$/);
const pick = (row, fields) =>
  Object.fromEntries(
    fields.flatMap((key) => (typeof row?.[key] === "string" ? [[key, row[key]]] : [])),
  );

/** Each process serves one account in an isolated OS user/container and secret store. */
export function executorConfig(env) {
  const provider = env.PROTON_MCP_PROVIDER;
  if (!["proton_pass", "proton_drive"].includes(provider))
    throw Error("Choose one Proton provider.");
  if (!env.PROTON_MCP_ACCOUNT_ID?.trim())
    throw Error("A persistent opaque account ID is required.");
  const binary = provider === "proton_pass" ? env.PROTON_PASS_BINARY : env.PROTON_DRIVE_BINARY;
  if (!binary || !isAbsolute(binary))
    throw Error("An absolute official CLI executable path is required.");
  if (
    provider === "proton_drive" &&
    !["keychain", "pass"].includes(env.PROTON_DRIVE_CREDENTIALS_STORE ?? "keychain")
  )
    throw Error("An encrypted native Drive session store is required.");
  const directory =
    provider === "proton_pass" ? env.PROTON_PASS_SESSION_DIR : env.PROTON_DRIVE_CACHE_DIR;
  if (!directory || !isAbsolute(directory))
    throw Error("An isolated absolute session directory is required.");
  return {
    provider,
    binary,
    accountId: env.PROTON_MCP_ACCOUNT_ID,
    write: env.PROTON_MCP_ALLOW_WRITES === "true",
  };
}

const schema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const text = { type: "string", minLength: 1, maxLength: 200 };
const tool = (name, description, inputSchema, write = false) => ({
  name,
  description,
  inputSchema,
  annotations: { readOnlyHint: !write, destructiveHint: write, openWorldHint: true },
});
export function toolsFor(config) {
  const result = [
    tool(
      "get_profile",
      "Return the configured immutable identity of this single-account executor.",
      schema(),
    ),
  ];
  if (config.provider === "proton_pass") {
    result.push(
      tool(
        "pass_list_vaults",
        "List vault metadata; never return passwords or item contents.",
        schema(),
      ),
    );
    result.push(
      tool(
        "pass_list_items",
        "List item IDs, titles and types in an authorized vault. No secret fields.",
        schema({ share_id: text }, ["share_id"]),
      ),
    );
    if (config.write)
      result.push(
        tool(
          "pass_create_vault",
          "Create a vault, subject to native account permissions. Requires explicit confirmation.",
          schema({ name: text, confirm: { const: true } }, ["name", "confirm"]),
          true,
        ),
        tool(
          "pass_rename_vault",
          "Rename a vault within the native grant. Requires confirmation and audit reason.",
          schema({ share_id: text, name: text, reason: text, confirm: { const: true } }, [
            "share_id",
            "name",
            "reason",
            "confirm",
          ]),
          true,
        ),
      );
  } else {
    result.push(
      tool(
        "drive_list_files",
        "List metadata beneath /my-files using the native saved Drive session.",
        schema({ path: text }),
      ),
    );
    if (config.write)
      result.push(
        tool(
          "drive_create_folder",
          "Create a folder beneath /my-files. Requires explicit confirmation.",
          schema({ path: text, name: text, confirm: { const: true } }, ["name", "confirm"]),
          true,
        ),
        tool(
          "drive_rename",
          "Rename an existing file or folder beneath /my-files. Requires explicit confirmation.",
          schema({ path: text, name: text, confirm: { const: true } }, ["path", "name", "confirm"]),
          true,
        ),
      );
  }
  return result;
}

export async function invoke(config, operation, args = {}, env = process.env, run = execute) {
  const definition = toolsFor(config).find((tool) => tool.name === operation);
  if (!definition) throw Error("Operation is unavailable for this provider or write policy.");
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => !Object.hasOwn(definition.inputSchema.properties, key))
  )
    throw Error("Invalid operation arguments.");
  if (definition.annotations.destructiveHint && args.confirm !== true)
    throw Error("Explicit write confirmation is required.");
  if (operation === "get_profile") return { id: config.accountId };
  const childEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) =>
      [
        "PATH",
        "HOME",
        "XDG_RUNTIME_DIR",
        "DBUS_SESSION_BUS_ADDRESS",
        "GNUPGHOME",
        "PASSWORD_STORE_DIR",
        "PROTON_PASS_SESSION_DIR",
        "PROTON_DRIVE_CACHE_DIR",
        "PROTON_DRIVE_CREDENTIALS_STORE",
      ].includes(key),
    ),
  );
  childEnv.PROTON_DRIVE_LOG_LEVEL = "ERROR";
  let command;
  let transform = () => ({ completed: true, operation });
  if (operation === "pass_list_vaults") {
    command = ["vault", "list", "--output", "json"];
    transform = (output) => {
      const result = JSON.parse(output);
      if (!Array.isArray(result.vaults)) throw Error("Invalid output.");
      return {
        vaults: result.vaults
          .slice(0, 500)
          .map((row) => pick(row, ["name", "vault_id", "share_id"])),
      };
    };
  } else if (operation === "pass_list_items") {
    command = ["item", "list", "--share-id", id(args.share_id), "--output", "json"];
    transform = (output) => {
      const result = JSON.parse(output);
      if (!Array.isArray(result.items)) throw Error("Invalid output.");
      return {
        items: result.items
          .slice(0, 500)
          .map((row) => pick(row, ["id", "share_id", "vault_id", "title", "item_type"])),
      };
    };
  } else if (operation === "pass_create_vault")
    command = ["vault", "create", "--name", name(args.name)];
  else if (operation === "pass_rename_vault") {
    command = ["vault", "update", "--share-id", id(args.share_id), "--name", name(args.name)];
    childEnv.PROTON_PASS_AGENT_REASON = string(args.reason);
  } else if (operation === "drive_list_files") {
    command = ["filesystem", "list", remotePath(args.path), "--json"];
    transform = (output) => {
      const result = JSON.parse(output);
      if (!Array.isArray(result)) throw Error("Invalid output.");
      return {
        files: result.slice(0, 500).map((row) => ({
          ...pick(row, ["uid", "type"]),
          ...(row?.name?.ok === true && typeof row.name.value === "string"
            ? { name: row.name.value }
            : {}),
        })),
      };
    };
  } else if (operation === "drive_create_folder")
    command = ["filesystem", "create-folder", remotePath(args.path), name(args.name), "--json"];
  else if (operation === "drive_rename")
    command = ["filesystem", "rename", remotePath(args.path), name(args.name), "--json"];
  try {
    const { stdout } = await run(config.binary, command, {
      env: childEnv,
      timeout: 30000,
      maxBuffer: 1048576,
      shell: false,
      windowsHide: true,
    });
    return transform(stdout);
  } catch {
    // Never forward raw stderr, session details, provider URLs or vault exports.
    throw Error(
      "Proton operation failed. Check native login, granted permissions and executor health on its trusted host.",
    );
  }
}
