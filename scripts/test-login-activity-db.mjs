import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Disposable database only: no ports, production URL, real identities or secrets.
const container = `open-connect-login-activity-${randomUUID()}`;
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
  // The image starts a temporary Unix-socket server during init, then restarts.
  // TCP readiness waits for the final server so tests cannot race that restart.
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], {
        stdio: "ignore",
      }).status === 0
    ) {
      ready = true;
      break;
    }
    await delay(100);
  }
  if (!ready) throw Error("Disposable database did not become ready");
  const input = [
    "supabase/tests/login_activity_fixture.sql",
    "supabase/migrations/20261030130000_login_activity.sql",
    "supabase/tests/login_activity.sql",
  ]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  docker(
    ["exec", "-i", container, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    input,
  );
  console.log(
    "Disposable PostgreSQL: login activity isolation, current-session flag and session revocation passed.",
  );
} finally {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
}
