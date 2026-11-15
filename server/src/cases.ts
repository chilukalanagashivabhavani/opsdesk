import { db } from "./db";

export function buildCaseId(agencyId: number, bookingRef: string | null, intent: string): string {
  return `${agencyId}-${bookingRef ?? "no-booking"}-${intent}`;
}

function ordinal(value: number): string {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  return `${value}${suffix}`;
}

export function buildCaseBanner(contactCount: number, intent: string, daysSpan: number): string | null {
  if (contactCount < 2) return null;
  const elapsed = daysSpan < 1 ? "today" : `in ${daysSpan} day${daysSpan === 1 ? "" : "s"}`;
  return `${ordinal(contactCount)} contact about this ${intent} ${elapsed}`;
}

export function linkTicketToCase(ticketId: number): string {
  const ticket = db.prepare("SELECT agency_id, booking_ref, intent FROM tickets WHERE id = ?").get(ticketId) as {
    agency_id: number; booking_ref: string | null; intent: string;
  } | undefined;
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  const caseId = buildCaseId(ticket.agency_id, ticket.booking_ref, ticket.intent);
  const earlier = db.prepare(`
    SELECT COUNT(*) AS count FROM tickets
    WHERE agency_id = ? AND booking_ref IS ? AND intent = ? AND id < ?
  `).get(ticket.agency_id, ticket.booking_ref, ticket.intent, ticketId) as { count: number };
  db.prepare("UPDATE tickets SET case_id = ? WHERE id = ?").run(caseId, ticketId);

  if (earlier.count > 0) {
    db.prepare("INSERT INTO ticket_events (ticket_id, type, detail, created_at) VALUES (?, 'case_linked', ?, ?)")
      .run(ticketId, `Linked to case with ${earlier.count} earlier tickets`, new Date().toISOString());
  }
  return caseId;
}

export function daysBetween(first: string, last: string): number {
  return Math.max(0, Math.floor((new Date(last).getTime() - new Date(first).getTime()) / 86400000));
}
