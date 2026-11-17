import express, { Request, Response } from "express";
import cors from "cors";
import { db, initializeDatabase } from "./db";
import { buildCaseBanner, daysBetween } from "./cases";
import { escalateIfNeeded } from "./escalation";
import { processTicket } from "./pipeline";
import { seedDatabase } from "./seed";
import { slaWindowMinutes, SlaPriority } from "./sla";
import { createSideConversation, Recipient, recipientRoles, transferTicket, updateTicketStatus } from "./actions";
import { getExportFilters, getExportStats, streamTicketCsv } from "./export";
import { getInsights } from "./insights";
import { authenticate, findUserByEmail, hashPassword, issueToken, publicUser, verifyPassword, AuthUser, AgentRole } from "./auth";

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

function getSlaStatusCounts(): { ok: number; at_risk: number; breached: number } {
  const counts = { ok: 0, at_risk: 0, breached: 0 };
  const now = new Date();
  for (const row of db.prepare(ticketSelect).all()) {
    const status = decorateTicket(row as Record<string, unknown>, now).sla_status as keyof typeof counts;
    if (status in counts) counts[status]++;
  }
  return counts;
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

function requireManager(req: Request, res: Response): boolean {
  if (req.user?.role === "escalation_manager") return true;
  res.status(403).json({ error: "This action is available to escalation managers only" });
  return false;
}

function requireTicketAccess(req: Request, res: Response, ticketId: number): boolean {
  if (req.user?.role === "escalation_manager") return true;
  const ticket = db.prepare("SELECT assigned_agent_id FROM tickets WHERE id = ?").get(ticketId) as { assigned_agent_id: number | null } | undefined;
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return false;
  }
  if (ticket.assigned_agent_id !== req.user?.id) {
    res.status(403).json({ error: "Agents can only modify tickets assigned to them" });
    return false;
  }
  return true;
}

function issueUserToken(user: AuthUser): { token: string; user: AuthUser } {
  return { token: issueToken(user), user };
}

const teamRegions = new Set(["India", "Middle East", "Europe", "SE Asia"]);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateTeamFields(body: Record<string, unknown>, requirePassword: boolean): string | null {
  for (const field of ["name", "email", "role", "region", "shift_start", "shift_end"]) {
    if (typeof body[field] !== "string" || !String(body[field]).trim()) return `${field} is required`;
  }
  if (!emailPattern.test(String(body.email))) return "A valid email is required";
  if (!["agent", "escalation_manager"].includes(String(body.role))) return "Role must be agent or escalation_manager";
  if (!teamRegions.has(String(body.region))) return "Region is invalid";
  if (!timePattern.test(String(body.shift_start)) || !timePattern.test(String(body.shift_end))) return "Shift times must use HH:MM";
  if (requirePassword && (typeof body.password !== "string" || body.password.length < 8)) return "Password must be at least 8 characters";
  if (!requirePassword && body.password !== undefined && (typeof body.password !== "string" || body.password.length < 8)) return "Password must be at least 8 characters";
  return null;
}
function audit(actorId: number, action: string, targetId: number | null, detail: string): void {
  db.prepare("INSERT INTO audit_log (actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(actorId, action, targetId, detail, new Date().toISOString());
}

app.post("/api/auth/login", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const record = findUserByEmail(email);
  if (!record) return res.status(401).json({ error: "Invalid email or password" });
  if (!record.active) return res.status(401).json({ error: "Account is deactivated" });
  if (!verifyPassword(password, record.password_hash)) return res.status(401).json({ error: "Invalid email or password" });
  return res.json(issueUserToken(publicUser(record)));
});

app.post("/api/auth/demo-login", (req, res) => {
  if (process.env.NODE_ENV === "production") return res.status(403).json({ error: "Demo login is disabled in production" });
  const agentId = Number(req.body?.agent_id);
  const record = db.prepare("SELECT id, name, email, role, region, active FROM agents WHERE id = ?").get(agentId) as (AuthUser & { active: number }) | undefined;
  if (!record) return res.status(401).json({ error: "Demo user not found" });
  if (!record.active) return res.status(401).json({ error: "Account is deactivated" });
  return res.json(issueUserToken(publicUser(record)));
});
app.get("/api/auth/demo-users", (_req, res) => {
  return res.json(db.prepare("SELECT id, name, role, region FROM agents WHERE active = 1 ORDER BY role DESC, name").all());
});

app.use("/api", authenticate);

app.get("/api/auth/me", (req, res) => res.json({ user: req.user }));
app.get("/api/agencies", (_req, res) => res.json(db.prepare("SELECT * FROM agencies ORDER BY name").all()));
app.get("/api/agencies/:id/bookings", (req, res) => {
  const agency = db.prepare("SELECT id FROM agencies WHERE id = ?").get(Number(req.params.id));
  if (!agency) return res.status(404).json({ error: "Agency not found" });
  return res.json(db.prepare("SELECT * FROM bookings WHERE agency_id = ? ORDER BY check_in_date").all(Number(req.params.id)));
});
app.get("/api/agents", (_req, res) => res.json(db.prepare("SELECT id, name, role, region, shift_start, shift_end, online FROM agents WHERE active = 1 ORDER BY name").all()));
app.get("/api/team", (req, res) => {
  if (!requireManager(req, res)) return;
  return res.json(db.prepare(`
    SELECT ag.id, ag.name, ag.email, ag.role, ag.region, ag.shift_start, ag.shift_end, ag.online, ag.active,
           (SELECT COUNT(*) FROM tickets t WHERE t.assigned_agent_id = ag.id AND t.status = 'open') AS open_ticket_count
    FROM agents ag ORDER BY ag.name
  `).all());
});
app.get("/api/team/audit", (req, res) => {
  if (!requireManager(req, res)) return;
  return res.json(db.prepare(`
    SELECT al.id, al.action, al.target_id, al.detail, al.created_at, actor.name AS actor_name
    FROM audit_log al JOIN agents actor ON actor.id = al.actor_id
    ORDER BY al.created_at DESC, al.id DESC LIMIT 10
  `).all());
});
app.post("/api/team", (req, res) => {
  if (!requireManager(req, res)) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const validation = validateTeamFields(body, true);
  if (validation) return res.status(400).json({ error: validation });
  const email = String(body.email).trim().toLowerCase();
  if (db.prepare("SELECT id FROM agents WHERE lower(email) = ?").get(email)) return res.status(409).json({ error: "A user with that email already exists" });
  const result = db.prepare(`
    INSERT INTO agents (name, email, role, region, shift_start, shift_end, online, active, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
  `).run(String(body.name).trim(), email, String(body.role) as AgentRole, String(body.region), String(body.shift_start), String(body.shift_end), hashPassword(String(body.password)));
  const id = Number(result.lastInsertRowid);
  audit(req.user!.id, "team_member_created", id, `Created ${String(body.role)} ${String(body.name).trim()} (${email})`);
  return res.status(201).json({ id, name: String(body.name).trim(), email, password: String(body.password) });
});
app.patch("/api/team/:id", (req, res) => {
  if (!requireManager(req, res)) return;
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as (AuthUser & { active: number; shift_start: string; shift_end: string; online: number; password_hash: string | null }) | undefined;
  if (!current) return res.status(404).json({ error: "Team member not found" });
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (id === req.user!.id && body.active === false) return res.status(400).json({ error: "You cannot deactivate your own account" });
  if (id === req.user!.id && body.role !== undefined && body.role !== current.role) return res.status(400).json({ error: "You cannot change your own role" });
  const merged = { name: body.name ?? current.name, email: current.email, role: body.role ?? current.role, region: body.region ?? current.region, shift_start: body.shift_start ?? current.shift_start, shift_end: body.shift_end ?? current.shift_end, password: body.password };
  const validation = validateTeamFields(merged, false);
  if (validation) return res.status(400).json({ error: validation });
  if (body.email !== undefined && String(body.email).toLowerCase() !== String(current.email).toLowerCase()) return res.status(400).json({ error: "Email cannot be changed here" });
  const passwordHash = body.password === undefined ? current.password_hash : hashPassword(String(body.password));
  db.prepare(`
    UPDATE agents SET name = ?, role = ?, region = ?, shift_start = ?, shift_end = ?, online = ?, active = ?, password_hash = ?
    WHERE id = ?
  `).run(String(merged.name).trim(), String(merged.role), String(merged.region), String(merged.shift_start), String(merged.shift_end), body.online === undefined ? current.online : (body.online ? 1 : 0), body.active === undefined ? current.active : (body.active ? 1 : 0), passwordHash, id);
  audit(req.user!.id, "team_member_updated", id, `Updated team member ${String(merged.name).trim()}`);
  return res.json(db.prepare("SELECT id, name, email, role, region, shift_start, shift_end, online, active FROM agents WHERE id = ?").get(id));
});
app.get("/api/insights", async (req, res) => {
  if (!requireManager(req, res)) return;
  try {
    return res.json(await getInsights(req.query.refresh === "1"));
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to build insights" });
  }
});
app.get("/api/export/tickets.csv", (req, res) => {
  if (!requireManager(req, res)) return;
  return streamTicketCsv(db, res, getExportFilters(req.query as Record<string, unknown>));
});
app.get("/api/export/stats", (req, res) => {
  if (!requireManager(req, res)) return;
  return res.json({ total_rows: getExportStats(db, getExportFilters(req.query as Record<string, unknown>)) });
});
app.get("/api/tickets", (req, res) => {
  const now = new Date();
  const mine = req.query.mine === "1";
  const where = mine ? " WHERE t.assigned_agent_id = ?" : "";
  const tickets = db.prepare(`${ticketSelect}${where}`).all(...(mine ? [req.user!.id] : [])).map((row) => decorateTicket(row as Record<string, unknown>, now));
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
app.get("/api/tickets/:id/side-conversations", (req, res) => {
  const ticket = db.prepare("SELECT id FROM tickets WHERE id = ?").get(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  const conversations = db.prepare("SELECT * FROM side_conversations WHERE ticket_id = ? ORDER BY id").all(Number(req.params.id)) as Array<{ id: number; ticket_id: number; subject: string; recipients_json: string }>;
  return res.json(conversations.map((conversation) => {
    const messages = db.prepare("SELECT * FROM side_messages WHERE side_conversation_id = ? ORDER BY created_at ASC, id ASC").all(conversation.id);
    let recipients: Recipient[] = [];
    try {
      const parsed = JSON.parse(conversation.recipients_json);
      if (Array.isArray(parsed)) recipients = parsed;
    } catch {
      recipients = [];
    }
    return { id: conversation.id, ticket_id: conversation.ticket_id, subject: conversation.subject, recipients, messages: messages ?? [], message_count: messages.length };
  }));
});
app.get("/api/recipient-presets", (_req, res) => res.json([
  { name: "Hotel front desk", recipients: [{ name: "Anita Rao", email: "frontdesk@tajpalace.example", role: "hotel" }] },
  { name: "Supplier ops desk", recipients: [{ name: "Mina Al-Farsi", email: "ops@supplierdesk.example", role: "supplier" }] },
  { name: "Finance team", recipients: [{ name: "Rahul Menon", email: "finance@globelink.example", role: "finance" }, { name: "Priya Shah", email: "priya@opsdesk.example", role: "internal" }] }
]));
app.get("/api/tickets/:id/case", (req, res) => {
  const ticket = db.prepare("SELECT case_id, intent FROM tickets WHERE id = ?").get(Number(req.params.id)) as { case_id: string | null; intent: string } | undefined;
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (!ticket.case_id) return res.json({ case_id: null, contact_count: 0, first_contact_at: null, last_contact_at: null, days_span: 0, tickets: [], banner: null });
  const tickets = db.prepare("SELECT id, subject, status, created_at FROM tickets WHERE case_id = ? ORDER BY created_at ASC, id ASC").all(ticket.case_id) as Array<{ id: number; subject: string; status: string; created_at: string }>;
  if (tickets.length === 0) return res.json({ case_id: ticket.case_id, contact_count: 0, first_contact_at: null, last_contact_at: null, days_span: 0, tickets: [], banner: null });
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
           (SELECT latest.id FROM tickets latest WHERE latest.case_id = t.case_id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1) AS latest_ticket_id,
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

app.patch("/api/tickets/:id", (req, res) => {
  const status = req.body?.status;
  if (!["open", "pending", "resolved"].includes(status)) return res.status(400).json({ error: "Status must be open, pending, or resolved" });
  if (!requireTicketAccess(req, res, Number(req.params.id))) return;
  try {
    updateTicketStatus(Number(req.params.id), status, req.user!.name);
    return res.json(getTicket(Number(req.params.id)));
  } catch (error) {
    return res.status(404).json({ error: error instanceof Error ? error.message : "Ticket not found" });
  }
});

app.post("/api/tickets/:id/transfer", (req, res) => {
  const agentId = req.body?.agent_id;
  if (!Number.isInteger(agentId)) return res.status(400).json({ error: "agent_id is required" });
  if (!requireTicketAccess(req, res, Number(req.params.id))) return;
  try {
    const result = transferTicket(Number(req.params.id), agentId, typeof req.body?.note === "string" ? req.body.note : undefined, req.user!.name);
    return res.json({ ticket: getTicket(Number(req.params.id)), ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to transfer ticket";
    return res.status(message === "Ticket not found" ? 404 : 400).json({ error: message });
  }
});

app.post("/api/tickets/:id/side-conversations", (req, res) => {
  const { subject, recipients, body } = req.body as { subject?: unknown; recipients?: unknown; body?: unknown };
  const validRecipients = Array.isArray(recipients) && recipients.every((recipient) => {
    const item = recipient as Partial<Recipient>;
    return typeof item.name === "string" && typeof item.email === "string" && typeof item.role === "string" && recipientRoles.has(item.role);
  });
  if (typeof subject !== "string" || !subject.trim() || !validRecipients || !Array.isArray(recipients) || recipients.length === 0 || typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "subject, recipients and body are required; recipient roles must be valid" });
  }
  try {
    const id = createSideConversation(Number(req.params.id), subject, recipients as Recipient[], body, req.user!.name);
    return res.status(201).json({ id });
  } catch (error) {
    return res.status(404).json({ error: error instanceof Error ? error.message : "Ticket not found" });
  }
});

app.post("/api/side-conversations/:id/messages", (req, res) => {
  const { body } = req.body as { body?: unknown };
  if (typeof body !== "string" || !body.trim()) return res.status(400).json({ error: "body is required" });
  const conversation = db.prepare("SELECT id FROM side_conversations WHERE id = ?").get(Number(req.params.id));
  if (!conversation) return res.status(404).json({ error: "Side conversation not found" });
  const result = db.prepare("INSERT INTO side_messages (side_conversation_id, sender, body, created_at) VALUES (?, ?, ?, ?)")
    .run(Number(req.params.id), req.user!.name, body.trim(), new Date().toISOString());
  return res.status(201).json(db.prepare("SELECT * FROM side_messages WHERE id = ?").get(Number(result.lastInsertRowid)));
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
app.post("/api/demo/reset", (_req, res) => {
  const result = seedDatabase();
  return res.json({ ok: true, tickets: result.tickets, by_sla_status: getSlaStatusCounts() });
});

const escalationJob = setInterval(() => {
  const openTickets = db.prepare("SELECT id FROM tickets WHERE status = 'open' AND escalated = 0").all() as Array<{ id: number }>;
  for (const ticket of openTickets) escalateIfNeeded(ticket.id, new Date());
}, 30000);
escalationJob.unref();

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`OpsDesk API listening on http://localhost:${port}`));
}

export { app };
