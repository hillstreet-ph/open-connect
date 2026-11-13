import test from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_WIDTH_DEFAULT_REM,
  SIDEBAR_WIDTH_MAX_REM,
  SIDEBAR_WIDTH_MIN_REM,
  sidebarDefaultOpen,
  sidebarWidthRem,
} from "./sidebar-state.ts";

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

function withWidthCookie(value: string | null, run: () => void) {
  const globals = globalThis as { document?: unknown };
  const previous = globals.document;
  globals.document = {
    get cookie() {
      return value === null ? "other=value" : `sidebar_width=${value}`;
    },
  };
  try {
    run();
  } finally {
    if (previous === undefined) delete globals.document;
    else globals.document = previous;
  }
}

test("sidebar width uses the stored value when it is in range", () => {
  withWidthCookie("20", () => assert.equal(sidebarWidthRem(), 20));
});

test("sidebar width clamps out-of-range stored values", () => {
  withWidthCookie("5", () => assert.equal(sidebarWidthRem(), SIDEBAR_WIDTH_MIN_REM));
  withWidthCookie("99", () => assert.equal(sidebarWidthRem(), SIDEBAR_WIDTH_MAX_REM));
});

test("sidebar width falls back to the default for missing or invalid values", () => {
  withWidthCookie(null, () => assert.equal(sidebarWidthRem(), SIDEBAR_WIDTH_DEFAULT_REM));
  withWidthCookie("abc", () => assert.equal(sidebarWidthRem(), SIDEBAR_WIDTH_DEFAULT_REM));
});
