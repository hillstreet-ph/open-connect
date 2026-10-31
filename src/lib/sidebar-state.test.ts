import test from "node:test";
import assert from "node:assert/strict";
import { SIDEBAR_COOKIE_NAME, sidebarDefaultOpen } from "./sidebar-state.ts";

function withCookie(value: string | null, run: () => void) {
  const globals = globalThis as { document?: unknown };
  const previous = globals.document;
  const store = new Map<string, string>();
  if (value !== null) store.set(SIDEBAR_COOKIE_NAME, value);
  globals.document = {
    get cookie() {
      return [...store.entries()].map(([key, entry]) => `${key}=${entry}`).join("; ");
    },
  };
  try {
    run();
  } finally {
    if (previous === undefined) delete globals.document;
    else globals.document = previous;
  }
}

test("sidebar opens by default when no choice has been stored", () => {
  withCookie(null, () => assert.equal(sidebarDefaultOpen(), true));
});

test("sidebar restores the stored collapsed and expanded choices", () => {
  withCookie("false", () => assert.equal(sidebarDefaultOpen(), false));
  withCookie("true", () => assert.equal(sidebarDefaultOpen(), true));
});

test("an unrelated cookie does not change the default", () => {
  const globals = globalThis as { document?: unknown };
  const previous = globals.document;
  globals.document = { cookie: "other=value" };
  try {
    assert.equal(sidebarDefaultOpen(), true);
  } finally {
    if (previous === undefined) delete globals.document;
    else globals.document = previous;
  }
});
