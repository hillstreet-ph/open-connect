import assert from "node:assert/strict";
import test from "node:test";
import { profileDraftValue, subscribeToCarousel, subscribeToMediaQuery } from "./react-compat.ts";

test("profile refresh preserves unsaved edits, including an intentional empty value", () => {
  assert.equal(profileDraftValue(null, undefined, ""), "");
  assert.equal(profileDraftValue(null, "one", "Loaded"), "Loaded");
  assert.equal(profileDraftValue({ userId: "one", value: "Edited" }, "one", "Refreshed"), "Edited");
  assert.equal(profileDraftValue({ userId: "one", value: "" }, "one", "Refreshed"), "");
});

test("profile drafts cannot appear for a different signed-in user", () => {
  assert.equal(
    profileDraftValue({ userId: "one", value: "Private edit" }, "two", "Other user"),
    "Other user",
  );
  assert.equal(profileDraftValue({ userId: "one", value: "Private edit" }, undefined, ""), "");
});

test("media query listener receives changes and detaches on unmount", () => {
  const events = new EventTarget();
  let changes = 0;
  const cleanup = subscribeToMediaQuery(events as MediaQueryList, () => changes++);
  events.dispatchEvent(new Event("change"));
  assert.equal(changes, 1);
  cleanup();
  events.dispatchEvent(new Event("change"));
  assert.equal(changes, 1);
});

test("carousel subscription handles selection and reinitialization and removes both listeners", () => {
  const events = new EventTarget();
  const api = {
    on: (name: string, listener: () => void) => events.addEventListener(name, listener),
    off: (name: string, listener: () => void) => events.removeEventListener(name, listener),
  };
  let changes = 0;
  const cleanup = subscribeToCarousel(api, () => changes++);
  events.dispatchEvent(new Event("select"));
  events.dispatchEvent(new Event("reInit"));
  assert.equal(changes, 2);
  cleanup();
  events.dispatchEvent(new Event("select"));
  events.dispatchEvent(new Event("reInit"));
  assert.equal(changes, 2);
  assert.doesNotThrow(subscribeToCarousel(undefined, () => changes++));
});
