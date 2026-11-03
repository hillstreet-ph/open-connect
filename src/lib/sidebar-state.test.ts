import test from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_WIDTH_COOKIE_NAME,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
  sidebarDefaultOpen,
  sidebarDefaultWidth,
} from "./sidebar-state.ts";

function withCookies(entries: Record<string, string>, run: () => void) {
  const globals = globalThis as { document?: unknown };
  const previous = globals.document;
  const store = new Map<string, string>(Object.entries(entries));
  globals.document = {
    get cookie() {
      return [...store.entries()].map(([key, entry]) => `${key}=${entry}`).join("; "),
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
  withCookies({}, () => assert.equal(sidebarDefaultOpen(), true));
});

test("sidebar restores the stored collapsed and expanded choices", () => {
  withCookies({ [SIDEBAR_COOKIE_NAME]: "false" }, () => assert.equal(sidebarDefaultOpen(), false));
  withCookies({ [SIDEBAR_COOKIE_NAME]: "true" }, () => assert.equal(sidebarDefaultOpen(), true));
});

test("an unrelated cookie does not change the defaults", () => {
  withCookies({ other: "value" }, () => {
    assert.equal(sidebarDefaultOpen(), true);
    assert.equal(sidebarDefaultWidth(), SIDEBAR_WIDTH_DEFAULT);
  });
});

test("sidebar width clamps to the supported range", () => {
  assert.equal(clampSidebarWidth(10), SIDEBAR_WIDTH_MIN);
  assert.equal(clampSidebarWidth(9999), SIDEBAR_WIDTH_MAX);
  assert.equal(clampSidebarWidth(300.6), 301);
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_WIDTH_DEFAULT);
});

test("sidebar width restores the stored choice and ignores invalid values", () => {
  withCookies({ [SIDEBAR_WIDTH_COOKIE_NAME]: "320" }, () => {
    assert.equal(sidebarDefaultWidth(), 320);
  });
  withCookies({ [SIDEBAR_WIDTH_COOKIE_NAME]: "not-a-number" }, () => {
    assert.equal(sidebarDefaultWidth(), SIDEBAR_WIDTH_DEFAULT);
  });
  withCookies({ [SIDEBAR_WIDTH_COOKIE_NAME]: "9999" }, () => {
    assert.equal(sidebarDefaultWidth(), SIDEBAR_WIDTH_MAX);
  });
});
