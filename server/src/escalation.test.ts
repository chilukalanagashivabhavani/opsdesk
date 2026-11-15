import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { db, initializeDatabase } from "./db";
import { escalateIfNeeded } from "./escalation";

initializeDatabase();
const now = "2026-01-01T12:00:00.000Z";

beforeEach(() => {
  db.exec("DELETE FROM ticket_events; DELETE FROM messages; DELETE FROM tickets; DELETE FROM bookings; DELETE FROM agents; DELETE FROM agencies;");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('agencies', 'agents', 'tickets', 'messages', 'ticket_events');");
  db.prepare("INSERT INTO agencies (name, region, tier) VALUES ('Test Agency', 'India', 'gold')").run();
  db.prepare("INSERT INTO agents (name, role, region, shift_start, shift_end, online) VALUES ('Manager', 'escalation_manager', 'India', '00:00', '23:59', 1)").run();
});

function insertTicket(priority: string, dueAt: string, caseId: string | null = null): number {
  const result = db.prepare(`
    INSERT INTO tickets (agency_id, intent, subject, description, priority, status, case_id, sla_due_at, created_at)
    VALUES (1, 'refund', 'Test', 'Test', ?, 'open', ?, ?, ?)
  `).run(priority, caseId, dueAt, now);
  return Number(result.lastInsertRowid);
}

test("escalates when 80% of the SLA window has elapsed", () => {
  const id = insertTicket("high", "2026-01-01T12:10:00.000Z");
  assert.equal(escalateIfNeeded(id, now).reason, "SLA 80% elapsed");
});

test("escalates a breached SLA", () => {
  const id = insertTicket("critical", "2026-01-01T11:59:00.000Z");
  assert.equal(escalateIfNeeded(id, now).reason, "SLA breached");
});

test("escalates a third case contact", () => {
  insertTicket("low", "2026-01-02T12:00:00.000Z", "1-TBOH1-refund");
  insertTicket("low", "2026-01-02T12:00:00.000Z", "1-TBOH1-refund");
  const id = insertTicket("low", "2026-01-02T12:00:00.000Z", "1-TBOH1-refund");
  assert.equal(escalateIfNeeded(id, now).reason, "3rd repeat contact");
});

test("does not escalate the same ticket twice", () => {
  const id = insertTicket("critical", "2026-01-01T11:59:00.000Z");
  assert.equal(escalateIfNeeded(id, now).escalated, true);
  assert.equal(escalateIfNeeded(id, now).escalated, false);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM ticket_events WHERE ticket_id = ? AND type = 'escalated'").get(id) as { count: number }).count, 1);
});
