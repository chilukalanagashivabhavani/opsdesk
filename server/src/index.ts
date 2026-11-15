import express, { Request, Response } from "express";
import cors from "cors";
import { db, initializeDatabase } from "./db";
import { buildCaseBanner, daysBetween, linkTicketToCase } from "./cases";

initializeDatabase();
const app = express();
app.use(cors());
app.use(express.json());

const ticketSelect = `
  SELECT t.*, a.name AS agency_name, a.region AS agency_region,
         b.hotel_name, b.destination, b.check_in_date, b.lcd_date, b.amount,
         (SELECT COUNT(*) FROM tickets ct WHERE ct.case_id = t.case_id) AS contact_count
  FROM tickets t
  LEFT JOIN agencies a ON a.id = t.agency_id
  LEFT JOIN bookings b ON b.booking_ref = t.booking_ref
`;

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/agencies", (_req, res) => res.json(db.prepare("SELECT * FROM agencies ORDER BY name").all()));
app.get("/api/agents", (_req, res) => res.json(db.prepare("SELECT * FROM agents ORDER BY name").all()));
app.get("/api/tickets", (_req, res) => res.json(db.prepare(`${ticketSelect} ORDER BY t.created_at DESC`).all()));
app.get("/api/tickets/:id", (req, res) => {
  const ticket = db.prepare(`${ticketSelect} WHERE t.id = ?`).get(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  const messages = db.prepare("SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at").all(Number(req.params.id));
  return res.json({ ...ticket, messages });
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
  const result = db.prepare("INSERT INTO tickets (agency_id, booking_ref, intent, subject, description, priority, status, created_at) VALUES (?, ?, ?, ?, ?, 'normal', 'open', ?)").run(agency_id, booking_ref ?? null, intent, subject.trim(), description.trim(), new Date().toISOString());
  linkTicketToCase(Number(result.lastInsertRowid));
  const ticket = db.prepare(`${ticketSelect} WHERE t.id = ?`).get(Number(result.lastInsertRowid));
  return res.status(201).json(ticket);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`OpsDesk API listening on http://localhost:${port}`));
