import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { setTimeout as pause } from "node:timers/promises";
const allocated = new Set();

export async function createDesktop(directory) {
  if (process.env.PLAYWRIGHT_LIVE_VIEW !== "1") return null;
  const display = Array.from({ length: 8 }, (_, i) => i + 100).find((n) => !allocated.has(n));
  if (!display) throw new Error("capacity");
  allocated.add(display);
  const port = 5900 + display;
  const env = { PATH: process.env.PATH, HOME: directory, DISPLAY: `:${display}` };
  const processes = [];
  const launch = (command, args) => {
    const child = spawn(command, args, { env, stdio: "ignore" });
    child.once("error", () => {
      child.startFailed = true;
    });
    processes.push(child);
    return child;
  };
  const close = async () => {
    for (const child of processes.reverse()) child.kill("SIGTERM");
    await Promise.all(
      processes.map(
        (child) =>
          new Promise((resolve) => {
            if (child.exitCode !== null) return resolve();
            const timer = setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 3000);
            child.once("exit", () => {
              clearTimeout(timer);
              resolve();
            });
          }),
      ),
    );
    allocated.delete(display);
  };
  try {
    const screen = launch("Xvfb", [
      `:${display}`,
      "-screen",
      "0",
      "1280x900x24",
      "-nolisten",
      "tcp",
      "-ac",
    ]);
    for (let attempt = 0; !existsSync(`/tmp/.X11-unix/X${display}`); attempt++) {
      if (attempt >= 100 || screen.startFailed || screen.exitCode !== null)
        throw new Error("desktop_unavailable");
      await pause(100);
    }
    launch("openbox", ["--sm-disable"]);
    const vnc = launch("x11vnc", [
      "-display",
      `:${display}`,
      "-localhost",
      "-rfbport",
      String(port),
      "-nopw",
      "-forever",
      "-shared",
      "-quiet",
    ]);
    for (let attempt = 0; ; attempt++) {
      const ready = await new Promise((resolve) => {
        const socket = connect(port, "127.0.0.1");
        socket.once("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.once("error", () => resolve(false));
        socket.setTimeout(500, () => {
          socket.destroy();
          resolve(false);
        });
      });
      if (ready) break;
      if (attempt >= 100 || vnc.startFailed || vnc.exitCode !== null)
        throw new Error("desktop_unavailable");
      await pause(100);
    }
    return { display: `:${display}`, port, close };
  } catch (error) {
    await close();
    throw error;
  }
}
