import assert from "node:assert/strict";
import test from "node:test";
import { routeTicket } from "./routing";

const baseAgent = { id: 1, name: "Night Agent", role: "agent" as const, region: "India", shift_start: "22:00", shift_end: "06:00", online: 1 };

test("prefers same-region agents on shift", () => {
  const result = routeTicket({ priority: "critical" }, { region: "India" }, [
    baseAgent,
    { ...baseAgent, id: 2, name: "Other Agent", region: "Europe", shift_start: "00:00", shift_end: "23:59" }
  ], new Map([[1, 0], [2, 0]]), "2026-01-01T23:00:00.000Z");
  assert.equal(result.agent_id, 1);
  assert.match(result.reason, /same region/);
});

test("handles shifts that cross midnight", () => {
  const result = routeTicket({ priority: "low" }, { region: "India" }, [baseAgent], new Map(), "2026-01-02T00:30:00.000Z");
  assert.match(result.reason, /on shift/);
});

test("falls back to the least-loaded online agent outside shift", () => {
  const result = routeTicket({ priority: "low" }, { region: "Europe" }, [
    { ...baseAgent, id: 1, name: "Busy Agent", region: "India" },
    { ...baseAgent, id: 2, name: "Free Agent", region: "India" }
  ], new Map([[1, 3], [2, 1]]), "2026-01-01T12:00:00.000Z");
  assert.equal(result.agent_id, 2);
  assert.match(result.reason, /least-loaded online agent/);
});
