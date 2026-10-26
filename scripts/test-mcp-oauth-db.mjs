import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Disposable database only: no ports, production URL, real identities or secrets.
const container = `open-connect-oauth-${randomUUID()}`;
function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw Error(result.stderr || "Disposable database command failed");
  return result.stdout;
}
try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--network",
    "none",
    "--name",
    container,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b",
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" })
        .status === 0
    ) {
      ready = true;
      break;
    }
    await delay(100);
  }
  if (!ready) throw Error("Disposable database did not become ready");
  const files = ["supabase/tests/key_access_fixture.sql", "supabase/tests/admin_oauth_fixture.sql"];
  const input =
    files.map((path) => readFileSync(path, "utf8")).join("\n") +
    "\nALTER TABLE public.api_keys ADD COLUMN last_used_at timestamptz;\n" +
    [
      "supabase/migrations/20261026065957_mcp_oauth_resource_binding.sql",
      "supabase/tests/admin_oauth_consent.sql",
      "supabase/tests/mcp_oauth_resource_binding.sql",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
  docker(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], input);
  console.log(
    "Disposable PostgreSQL: administrator consent, PKCE, single-use codes and resource binding passed.",
  );
} finally {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
}
