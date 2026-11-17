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

test("never routes to an inactive agent", () => {
  const result = routeTicket({ priority: "low" }, { region: "India" }, [
    { ...baseAgent, id: 1, active: 0 },
    { ...baseAgent, id: 2, active: 1, region: "Europe" }
  ], new Map(), "2026-01-01T10:00:00.000Z");
  assert.equal(result.agent_id, 2);
});

test("handles shifts that cross midnight", () => {
  const result = routeTicket({ priority: "low" }, { region: "India" }, [baseAgent], new Map(), "2026-01-01T20:30:00.000Z");
  assert.match(result.reason, /on shift/);
});

test("interprets shifts in the agent region timezone", () => {
  const parisAgent = { ...baseAgent, region: "Europe", shift_start: "09:00", shift_end: "17:00" };
  assert.equal(routeTicket({ priority: "low" }, { region: "Europe" }, [parisAgent], new Map(), "2026-01-01T08:00:00.000Z").agent_id, 1);
});

test("falls back to the least-loaded online agent outside shift", () => {
  const result = routeTicket({ priority: "low" }, { region: "Europe" }, [
    { ...baseAgent, id: 1, name: "Busy Agent", region: "India" },
    { ...baseAgent, id: 2, name: "Free Agent", region: "India" }
  ], new Map([[1, 3], [2, 1]]), "2026-01-01T12:00:00.000Z");
  assert.equal(result.agent_id, 2);
  assert.match(result.reason, /least-loaded online agent/);
});
