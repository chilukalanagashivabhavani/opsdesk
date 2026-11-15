import { db } from "./db";
import { slaWindowMinutes, SlaPriority } from "./sla";

export interface EscalationResult {
  escalated: boolean;
  reason?: string;
  agent_id?: number;
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function ordinal(value: number): string {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  return `${value}${suffix}`;
}

export function escalateIfNeeded(ticketId: number, now: string | Date): EscalationResult {
  const ticket = db.prepare(`
    SELECT t.*, a.region AS agency_region,
           (SELECT COUNT(*) FROM tickets c WHERE c.case_id = t.case_id) AS contact_count
    FROM tickets t
    LEFT JOIN agencies a ON a.id = t.agency_id
    WHERE t.id = ?
  `).get(ticketId) as {
    id: number; status: string; escalated: number; priority: SlaPriority; created_at: string;
    sla_due_at: string | null; agency_region: string; contact_count: number;
  } | undefined;
  if (!ticket || ticket.status === "resolved" || ticket.escalated) return { escalated: false };

  const current = asDate(now);
  const due = ticket.sla_due_at ? new Date(ticket.sla_due_at) : null;
  const window = slaWindowMinutes(ticket.priority);
  const start = due ? new Date(due.getTime() - window * 60000) : null;
  const breached = due !== null && current.getTime() >= due.getTime();
  const atEightyPercent = start !== null && current.getTime() >= start.getTime() + window * 60000 * 0.8;
  const reason = breached ? "SLA breached" : atEightyPercent ? "SLA 80% elapsed" : ticket.contact_count >= 3 ? `${ordinal(ticket.contact_count)} repeat contact` : undefined;
  if (!reason) return { escalated: false };

  const managers = db.prepare(`
    SELECT ag.id, ag.name, COUNT(open_t.id) AS open_count
    FROM agents ag
    LEFT JOIN tickets open_t ON open_t.assigned_agent_id = ag.id AND open_t.status = 'open'
    WHERE ag.role = 'escalation_manager' AND ag.online = 1
    GROUP BY ag.id
  `).all() as Array<{ id: number; name: string; open_count: number }>;
  if (managers.length === 0) return { escalated: false };
  const sameRegion = db.prepare(`
    SELECT ag.id, ag.name, COUNT(open_t.id) AS open_count
    FROM agents ag
    LEFT JOIN tickets open_t ON open_t.assigned_agent_id = ag.id AND open_t.status = 'open'
    WHERE ag.role = 'escalation_manager' AND ag.online = 1 AND ag.region = ?
    GROUP BY ag.id
  `).all(ticket.agency_region) as Array<{ id: number; name: string; open_count: number }>;
  const candidates = sameRegion.length > 0 ? sameRegion : managers;
  candidates.sort((left, right) => left.open_count - right.open_count || left.id - right.id);
  const manager = candidates[0];
  db.prepare("UPDATE tickets SET assigned_agent_id = ?, escalated = 1 WHERE id = ?").run(manager.id, ticketId);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, detail, created_at) VALUES (?, 'escalated', ?, ?)")
    .run(ticketId, `Escalated to ${manager.name}: ${reason}`, current.toISOString());
  return { escalated: true, reason, agent_id: manager.id };
}
