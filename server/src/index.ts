import express, { Request, Response } from "express";
import cors from "cors";
import { db, initializeDatabase } from "./db";
import { buildCaseBanner, daysBetween } from "./cases";
import { escalateIfNeeded } from "./escalation";
import { processTicket } from "./pipeline";
import { slaWindowMinutes, SlaPriority } from "./sla";

initializeDatabase();
const app = express();
app.use(cors());
app.use(express.json());

const ticketSelect = `
  SELECT t.*, a.name AS agency_name, a.region AS agency_region,
         b.hotel_name, b.destination, b.check_in_date, b.lcd_date, b.amount,
         assigned.name AS assigned_agent_name,
         (SELECT COUNT(*) FROM tickets ct WHERE ct.case_id = t.case_id) AS contact_count
  FROM tickets t
  LEFT JOIN agencies a ON a.id = t.agency_id
  LEFT JOIN bookings b ON b.booking_ref = t.booking_ref
  LEFT JOIN agents assigned ON assigned.id = t.assigned_agent_id
`;

function decorateTicket(row: Record<string, unknown>, now = new Date()): Record<string, unknown> {
  const due = typeof row.sla_due_at === "string" ? new Date(row.sla_due_at) : null;
  const minutesLeft = due ? Math.ceil((due.getTime() - now.getTime()) / 60000) : null;
  const isResolved = row.status === "resolved";
  const priority = row.priority as SlaPriority;
  const slaStatus = isResolved || minutesLeft === null ? "ok" : minutesLeft <= 0 ? "breached" : minutesLeft <= slaWindowMinutes(priority) * 0.2 ? "at_risk" : "ok";
  return { ...row, minutes_left: minutesLeft, sla_status: slaStatus };
}

function getTicket(ticketId: number, now = new Date()): Record<string, unknown> | undefined {
  const row = db.prepare(`${ticketSelect} WHERE t.id = ?`).get(ticketId) as Record<string, unknown> | undefined;
  return row ? decorateTicket(row, now) : undefined;
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/agencies", (_req, res) => res.json(db.prepare("SELECT * FROM agencies ORDER BY name").all()));
app.get("/api/agents", (_req, res) => res.json(db.prepare("SELECT * FROM agents ORDER BY name").all()));
app.get("/api/tickets", (_req, res) => {
  const now = new Date();
  const tickets = db.prepare(ticketSelect).all().map((row) => decorateTicket(row as Record<string, unknown>, now));
  tickets.sort((left, right) => {
    if (left.status === "resolved") return right.status === "resolved" ? 0 : 1;
    if (right.status === "resolved") return -1;
    return Number(left.minutes_left ?? Number.MAX_SAFE_INTEGER) - Number(right.minutes_left ?? Number.MAX_SAFE_INTEGER);
  });
  return res.json(tickets);
});
app.get("/api/tickets/:id", (req, res) => {
  const ticket = getTicket(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  const messages = db.prepare("SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at").all(Number(req.params.id));
  return res.json({ ...ticket, messages });
});
app.get("/api/tickets/:id/events", (req, res) => {
  const ticket = db.prepare("SELECT id FROM tickets WHERE id = ?").get(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  return res.json(db.prepare("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC, id ASC").all(Number(req.params.id)));
});
app.get("/api/tickets/:id/case", (req, res) => {
  const ticket = db.prepare("SELECT case_id, intent FROM tickets WHERE id = ?").get(Number(req.params.id)) as { case_id: string | null; intent: string } | undefined;
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (!ticket.case_id) return res.status(404).json({ error: "Ticket has no linked case" });
  const tickets = db.prepare("SELECT id, subject, status, created_at FROM tickets WHERE case_id = ? ORDER BY created_at ASC, id ASC").all(ticket.case_id) as Array<{ id: number; subject: string; status: string; created_at: string }>;
  const first = tickets[0].created_at;
  const last = tickets[tickets.length - 1].created_at;
  const daysSpan = daysBetween(first, last);
  return res.json({
    case_id: ticket.case_id,
    contact_count: tickets.length,
    first_contact_at: first,
    last_contact_at: last,
    days_span: daysSpan,
    tickets,
    banner: buildCaseBanner(tickets.length, ticket.intent, daysSpan)
  });
});
app.get("/api/cases", (_req, res) => {
  const cases = db.prepare(`
    SELECT t.case_id, COUNT(*) AS contact_count, a.name AS agency_name,
           t.booking_ref, t.intent,
           (SELECT latest.status FROM tickets latest WHERE latest.case_id = t.case_id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1) AS latest_ticket_status
    FROM tickets t
    LEFT JOIN agencies a ON a.id = t.agency_id
    WHERE t.case_id IS NOT NULL
    GROUP BY t.case_id
    HAVING COUNT(*) >= 2
    ORDER BY contact_count DESC, MAX(t.created_at) DESC
  `).all();
  return res.json(cases);
});

const allowedIntents = new Set(["refund", "cancellation", "amendment", "voucher", "payment", "other"]);
app.post("/api/tickets", (req: Request, res: Response) => {
  const { agency_id, booking_ref, intent, subject, description } = req.body as Record<string, unknown>;
  if (!Number.isInteger(agency_id) || typeof subject !== "string" || !subject.trim() || typeof description !== "string" || !description.trim() || typeof intent !== "string" || !allowedIntents.has(intent)) {
    return res.status(400).json({ error: "agency_id, intent, subject and description are required and valid" });
  }
  if (!db.prepare("SELECT id FROM agencies WHERE id = ?").get(agency_id)) return res.status(400).json({ error: "Agency not found" });
  if (booking_ref !== undefined && booking_ref !== null && !db.prepare("SELECT booking_ref FROM bookings WHERE booking_ref = ?").get(booking_ref)) return res.status(400).json({ error: "Booking not found" });
  const createdAt = new Date().toISOString();
  const result = db.prepare("INSERT INTO tickets (agency_id, booking_ref, intent, subject, description, priority, status, created_at) VALUES (?, ?, ?, ?, ?, 'low', 'open', ?)").run(agency_id, booking_ref ?? null, intent, subject.trim(), description.trim(), createdAt);
  processTicket(Number(result.lastInsertRowid), createdAt, true);
  const ticket = getTicket(Number(result.lastInsertRowid));
  return res.status(201).json(ticket);
});

app.post("/api/demo/critical", (_req, res) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const booking = db.prepare(`
    SELECT b.booking_ref, b.agency_id
    FROM bookings b
    WHERE b.check_in_date = ?
      AND EXISTS (SELECT 1 FROM tickets t WHERE t.booking_ref = b.booking_ref AND t.status = 'open')
    ORDER BY b.booking_ref
    LIMIT 1
  `).get(tomorrow.toISOString().slice(0, 10)) as { booking_ref: string; agency_id: number } | undefined;
  if (!booking) return res.status(409).json({ error: "No open case with check-in tomorrow is available" });
  const createdAt = new Date().toISOString();
  const result = db.prepare("INSERT INTO tickets (agency_id, booking_ref, intent, subject, description, priority, status, created_at) VALUES (?, ?, 'refund', 'Demo critical ticket', 'Demo ticket for urgent travel-aware routing.', 'low', 'open', ?)")
    .run(booking.agency_id, booking.booking_ref, createdAt);
  const ticketId = Number(result.lastInsertRowid);
  processTicket(ticketId, createdAt, true);
  return res.status(201).json({ ticket: getTicket(ticketId), events: db.prepare("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC, id ASC").all(ticketId) });
});

const escalationJob = setInterval(() => {
  const openTickets = db.prepare("SELECT id FROM tickets WHERE status = 'open' AND escalated = 0").all() as Array<{ id: number }>;
  for (const ticket of openTickets) escalateIfNeeded(ticket.id, new Date());
}, 30000);
escalationJob.unref();

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`OpsDesk API listening on http://localhost:${port}`));
