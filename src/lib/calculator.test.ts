import assert from "node:assert/strict";
import test from "node:test";
import { calculateExpression } from "./calculator.ts";

test("evaluates arithmetic with precedence and parentheses", () => {
  assert.equal(calculateExpression("2 + 3 * (4 - 1)"), 11);
  assert.equal(calculateExpression("2^3^2"), 512);
  assert.equal(calculateExpression("-5 + 12 / 3"), -1);
});

test("rejects executable syntax and invalid arithmetic", () => {
  assert.throws(() => calculateExpression("process.exit()"), /unsupported syntax/);
  assert.throws(() => calculateExpression("4 / 0"), /Division by zero/);
});
