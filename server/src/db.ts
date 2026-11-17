import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const databasePath = path.resolve(__dirname, "..", "data", "opsdesk.db");
const dataDirectory = path.dirname(databasePath);
fs.mkdirSync(dataDirectory, { recursive: true });

export const db = new Database(databasePath);
db.pragma("foreign_keys = ON");

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      tier TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('agent', 'escalation_manager')),
      email TEXT,
      password_hash TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      region TEXT NOT NULL,
      shift_start TEXT NOT NULL,
      shift_end TEXT NOT NULL,
      online INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bookings (
      booking_ref TEXT PRIMARY KEY,
      agency_id INTEGER NOT NULL REFERENCES agencies(id),
      hotel_name TEXT NOT NULL,
      destination TEXT NOT NULL,
      check_in_date TEXT NOT NULL,
      lcd_date TEXT NOT NULL,
      amount REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL REFERENCES agencies(id),
      booking_ref TEXT REFERENCES bookings(booking_ref),
      intent TEXT NOT NULL CHECK (intent IN ('refund', 'cancellation', 'amendment', 'voucher', 'payment', 'other')),
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved')),
      assigned_agent_id INTEGER REFERENCES agents(id),
      case_id TEXT,
      sla_due_at TEXT,
      escalated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS side_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      recipients_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS side_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      side_conversation_id INTEGER NOT NULL REFERENCES side_conversations(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_id INTEGER,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "email")) db.exec("ALTER TABLE agents ADD COLUMN email TEXT");
  if (!columns.some((column) => column.name === "password_hash")) db.exec("ALTER TABLE agents ADD COLUMN password_hash TEXT");
  if (!columns.some((column) => column.name === "active")) db.exec("ALTER TABLE agents ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  const auditForeignKeys = db.prepare("PRAGMA foreign_key_list(audit_log)").all() as unknown[];
  if (auditForeignKeys.length > 0) {
    db.exec(`
      ALTER TABLE audit_log RENAME TO audit_log_legacy;
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_id INTEGER,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO audit_log (id, actor_id, action, target_id, detail, created_at)
        SELECT id, actor_id, action, target_id, detail, created_at FROM audit_log_legacy;
      DROP TABLE audit_log_legacy;
    `);
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS agents_email_unique ON agents(email)");
}
