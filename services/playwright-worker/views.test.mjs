import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserViews } from "./views.mjs";
test("viewer grants expire, rotate and never revoke another owner's view", () => {
  let now = 0,
    closed = 0;
  const views = new BrowserViews({ lifetimeMs: 10, now: () => now });
  const first = views.issue("a", 6000),
    other = views.issue("b", 6001);
  views.get(first.token).sockets.add({
    close: () => {
      closed++;
    },
  });
  const rotated = views.issue("a", 6000);
  assert.equal(views.get(first.token), null);
  assert.equal(closed, 1);
  assert.equal(views.get(other.token).owner, "b");
  assert.equal(views.hasOwner("a"), true);
  now = 11;
  views.sweep();
  assert.equal(views.get(rotated.token), null);
  assert.equal(views.hasOwner("b"), false);
});
