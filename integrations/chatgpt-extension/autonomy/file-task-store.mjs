import fs from "node:fs/promises";
import path from "node:path";

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

export class FileTaskStore {
  constructor(directory) {
    if (!directory || typeof directory !== "string") {
      throw new Error("Storage directory required");
    }
    this.directory = directory;
  }

  taskPath(id) {
    if (!ID_PATTERN.test(id)) throw new Error("Invalid task id");
    return path.join(this.directory, `${id}.json`);
  }

  async save(task) {
    if (!task || typeof task !== "object" || task.schemaVersion !== 1) {
      throw new Error("Unsupported task schema");
    }
    const destination = this.taskPath(task.id);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(
      this.directory,
      `.${task.id}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporary, JSON.stringify(task, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return task.id;
  }

  async load(id) {
    try {
      const content = await fs.readFile(this.taskPath(id), "utf8");
      const task = JSON.parse(content);
      if (task.id !== id || task.schemaVersion !== 1) {
        throw new Error("Task integrity validation failed");
      }
      return task;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
}
