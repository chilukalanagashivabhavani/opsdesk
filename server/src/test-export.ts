import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { getExportStats, streamTicketCsv } from "./export";

const database = new Database(":memory:");
database.exec(`
  CREATE TABLE agencies (id INTEGER PRIMARY KEY, name TEXT, region TEXT);
  CREATE TABLE agents (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY, agency_id INTEGER, booking_ref TEXT, intent TEXT, subject TEXT,
    priority TEXT, status TEXT, assigned_agent_id INTEGER, sla_due_at TEXT, escalated INTEGER,
    case_id TEXT, created_at TEXT
  );
  INSERT INTO agencies VALUES (1, 'Synthetic Agency', 'India');
  INSERT INTO agents VALUES (1, 'Synthetic Agent');
`);
const insert = database.prepare("INSERT INTO tickets (id, agency_id, booking_ref, intent, subject, priority, status, assigned_agent_id, sla_due_at, escalated, case_id, created_at) VALUES (?, 1, ?, 'refund', ?, 'low', 'open', 1, NULL, 0, NULL, ?)");
const insertMany = database.transaction(() => {
  for (let i = 1; i <= 10000; i++) insert.run(i, `SYN${i}`, `Synthetic ticket ${i}`, "2026-01-01T00:00:00.000Z");
});
insertMany();

const chunks: string[] = [];
let ended = false;
const response = {
  setHeader: () => response,
  write: (chunk: string) => { chunks.push(chunk); return true; },
  end: () => { ended = true; }
};
streamTicketCsv(database, response, {});
const lines = chunks.join("").split("\n").filter(Boolean);
assert.equal(getExportStats(database, {}), 10000);
assert.equal(lines.length - 1, 10000);
assert.equal(ended, true);
console.log("Export test passed: 10,000 rows streamed without a cap.");
database.close();
