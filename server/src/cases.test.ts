import assert from "node:assert/strict";
import test from "node:test";
import { buildCaseBanner, buildCaseId } from "./cases";

test("builds a deterministic case id", () => {
  assert.equal(buildCaseId(2, "TBOH123456", "refund"), "2-TBOH123456-refund");
});

test("does not show a banner for the first contact", () => {
  assert.equal(buildCaseBanner(1, "refund", 0), null);
});

test("formats second and third contact banners", () => {
  assert.equal(buildCaseBanner(2, "refund", 0), "2nd contact about this refund today");
  assert.equal(buildCaseBanner(3, "refund", 2), "3rd contact about this refund in 2 days");
});
