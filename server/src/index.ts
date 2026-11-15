import express, { Request, Response } from "express";
import cors from "cors";
import { db, initializeDatabase } from "./db";

initializeDatabase();
const app = express();
app.use(cors());
app.use(express.json());

const ticketSelect = `
  SELECT t.*, a.name AS agency_name, a.region AS agency_region,
         b.hotel_name, b.destination, b.check_in_date, b.lcd_date, b.amount
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

const allowedIntents = new Set(["refund", "cancellation", "amendment", "voucher", "payment", "other"]);
app.post("/api/tickets", (req: Request, res: Response) => {
  const { agency_id, booking_ref, intent, subject, description } = req.body as Record<string, unknown>;
  if (!Number.isInteger(agency_id) || typeof subject !== "string" || !subject.trim() || typeof description !== "string" || !description.trim() || typeof intent !== "string" || !allowedIntents.has(intent)) {
    return res.status(400).json({ error: "agency_id, intent, subject and description are required and valid" });
  }
  if (!db.prepare("SELECT id FROM agencies WHERE id = ?").get(agency_id)) return res.status(400).json({ error: "Agency not found" });
  if (booking_ref !== undefined && booking_ref !== null && !db.prepare("SELECT booking_ref FROM bookings WHERE booking_ref = ?").get(booking_ref)) return res.status(400).json({ error: "Booking not found" });
  const result = db.prepare("INSERT INTO tickets (agency_id, booking_ref, intent, subject, description, priority, status, created_at) VALUES (?, ?, ?, ?, ?, 'normal', 'open', ?)").run(agency_id, booking_ref ?? null, intent, subject.trim(), description.trim(), new Date().toISOString());
  const ticket = db.prepare(`${ticketSelect} WHERE t.id = ?`).get(Number(result.lastInsertRowid));
  return res.status(201).json(ticket);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`OpsDesk API listening on http://localhost:${port}`));
