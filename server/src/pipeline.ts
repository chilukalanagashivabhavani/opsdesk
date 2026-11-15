import { db } from "./db";
import { escalateIfNeeded } from "./escalation";
import { linkTicketToCase } from "./cases";
import { routeTicket } from "./routing";
import { computeSla } from "./sla";

export function processTicket(ticketId: number, now: string | Date, linkCase = false): void {
  if (linkCase) linkTicketToCase(ticketId);
  const ticket = db.prepare(`
    SELECT t.*, b.check_in_date, b.lcd_date, a.region AS agency_region
    FROM tickets t
    LEFT JOIN bookings b ON b.booking_ref = t.booking_ref
    LEFT JOIN agencies a ON a.id = t.agency_id
    WHERE t.id = ?
  `).get(ticketId) as {
    agency_id: number; booking_ref: string | null; intent: string; priority: "critical" | "high" | "medium" | "low";
    check_in_date: string | null; lcd_date: string | null; agency_region: string;
  } | undefined;
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const fallbackDate = "9999-12-31";
  const sla = computeSla(ticket.check_in_date ?? fallbackDate, ticket.lcd_date ?? fallbackDate, now);
  db.prepare("UPDATE tickets SET priority = ?, sla_due_at = ? WHERE id = ?").run(sla.priority, sla.sla_due_at, ticketId);

  const agents = db.prepare("SELECT id, name, role, region, shift_start, shift_end, online FROM agents").all() as Array<{
    id: number; name: string; role: "agent" | "escalation_manager"; region: string; shift_start: string; shift_end: string; online: number;
  }>;
  const openCounts = new Map<number, number>();
  const counts = db.prepare("SELECT assigned_agent_id, COUNT(*) AS count FROM tickets WHERE status = 'open' AND assigned_agent_id IS NOT NULL GROUP BY assigned_agent_id").all() as Array<{ assigned_agent_id: number; count: number }>;
  for (const count of counts) openCounts.set(count.assigned_agent_id, count.count);
  const routing = routeTicket({ priority: sla.priority }, { region: ticket.agency_region }, agents, openCounts, now);
  if (routing.agent_id !== null) {
    db.prepare("UPDATE tickets SET assigned_agent_id = ? WHERE id = ?").run(routing.agent_id, ticketId);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, detail, created_at) VALUES (?, 'routed', ?, ?)")
      .run(ticketId, routing.reason, new Date(now instanceof Date ? now.getTime() : now).toISOString());
  }
  escalateIfNeeded(ticketId, now);
}
