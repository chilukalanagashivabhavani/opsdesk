import assert from "node:assert/strict";
import test from "node:test";
import { computeSla } from "./sla";

const now = "2026-01-01T00:00:00.000Z";

test("computes all SLA tiers and uses the earlier date", () => {
  assert.equal(computeSla("2026-01-01", "2026-01-02", now).priority, "critical");
  assert.equal(computeSla("2026-01-03", "2026-01-04", now).priority, "high");
  assert.equal(computeSla("2026-01-05", "2026-01-06", now).priority, "medium");
  assert.equal(computeSla("2026-01-10", "2026-01-20", now).priority, "low");
  assert.equal(computeSla("2025-12-31", "2026-01-10", now).priority, "critical");
});

test("adds the response window to the ticket creation time", () => {
  assert.equal(computeSla("2026-01-01", "2026-01-02", now).sla_due_at, "2026-01-01T00:15:00.000Z");
});
