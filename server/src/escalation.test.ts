import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { db, initializeDatabase } from "./db";
import { escalateIfNeeded } from "./escalation";
import { transferTicket } from "./actions";

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

test("transfer keeps side conversations and recipients unchanged", () => {
  const id = insertTicket("low", "2026-01-02T12:00:00.000Z");
  db.prepare("INSERT INTO agents (name, role, region, shift_start, shift_end, online) VALUES ('Agent Two', 'agent', 'India', '00:00', '23:59', 1)").run();
  const conversation = db.prepare("INSERT INTO side_conversations (ticket_id, subject, recipients_json) VALUES (?, 'Hotel check', ?)")
    .run(id, JSON.stringify([{ name: "Hotel Desk", email: "desk@hotel.example", role: "hotel" }]));
  db.prepare("INSERT INTO side_messages (side_conversation_id, sender, body, created_at) VALUES (?, 'Manager', 'Checking', ?)")
    .run(conversation.lastInsertRowid, now);
  const before = db.prepare("SELECT recipients_json FROM side_conversations WHERE ticket_id = ?").get(id) as { recipients_json: string };
  transferTicket(id, 2);
  const after = db.prepare("SELECT recipients_json FROM side_conversations WHERE ticket_id = ?").get(id) as { recipients_json: string };
  assert.equal(after.recipients_json, before.recipients_json);
  assert.equal((db.prepare("SELECT assigned_agent_id FROM tickets WHERE id = ?").get(id) as { assigned_agent_id: number }).assigned_agent_id, 2);
});

test("rejects transfer to an unknown agent", () => {
  const id = insertTicket("low", "2026-01-02T12:00:00.000Z");
  assert.throws(() => transferTicket(id, 999), /Target agent/);
});

test("resolved tickets are never escalated", () => {
  const id = insertTicket("critical", "2026-01-01T11:59:00.000Z");
  db.prepare("UPDATE tickets SET status = 'resolved' WHERE id = ?").run(id);
  assert.equal(escalateIfNeeded(id, now).escalated, false);
});
