import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveTarget } from "../src/tvTarget.js";

test("an allowed device targeting the TV plays on the TV", () => {
  assert.equal(effectiveTarget("tv", true, true), "tv");
});

test("the feature turned off server-side falls back to the device", () => {
  assert.equal(effectiveTarget("tv", true, false), "device");
});

test("a device not allowed in Settings (a kid's) always plays on itself", () => {
  assert.equal(effectiveTarget("tv", false, true), "device");
});

test("the pill switched to This device plays on the device", () => {
  assert.equal(effectiveTarget("device", true, true), "device");
  assert.equal(effectiveTarget(undefined, true, true), "device");
});
