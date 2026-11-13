import { createHash } from "node:crypto";
import { mkdir, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";

/** No owner-provided path is ever used as a filesystem component. */
export async function ownerProfile(root, owner) {
  if (!root) return null;
  const directory = join(resolve(root), createHash("sha256").update(owner).digest("hex"));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}
