import { db } from "./db";

export const recipientRoles = new Set(["hotel", "supplier", "finance", "agency", "internal"]);

export interface Recipient {
  name: string;
  email: string;
  role: "hotel" | "supplier" | "finance" | "agency" | "internal";
}

function getTicketOrThrow(ticketId: number): { id: number; status: string; assigned_agent_id: number | null } {
  const ticket = db.prepare("SELECT id, status, assigned_agent_id FROM tickets WHERE id = ?").get(ticketId) as { id: number; status: string; assigned_agent_id: number | null } | undefined;
  if (!ticket) throw new Error("Ticket not found");
  return ticket;
}

export function updateTicketStatus(ticketId: number, status: "open" | "pending" | "resolved"): void {
  const ticket = getTicketOrThrow(ticketId);
  if (ticket.status === status) return;
  db.prepare("UPDATE tickets SET status = ? WHERE id = ?").run(status, ticketId);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, detail, created_at) VALUES (?, 'status_changed', ?, ?)")
    .run(ticketId, `Status changed from ${ticket.status} to ${status}`, new Date().toISOString());
}

export function transferTicket(ticketId: number, agentId: number, note?: string): { sideConversationCount: number; recipientCount: number } {
  getTicketOrThrow(ticketId);
  const target = db.prepare("SELECT id, name, role FROM agents WHERE id = ?").get(agentId) as { id: number; name: string; role: string } | undefined;
  if (!target || !["agent", "escalation_manager"].includes(target.role)) throw new Error("Target agent must be an agent or escalation manager");
  const current = db.prepare("SELECT assigned_agent_id FROM tickets WHERE id = ?").get(ticketId) as { assigned_agent_id: number | null };
  const previous = current.assigned_agent_id
    ? (db.prepare("SELECT name FROM agents WHERE id = ?").get(current.assigned_agent_id) as { name: string } | undefined)?.name ?? "Unassigned"
    : "Unassigned";
  const conversations = db.prepare("SELECT recipients_json FROM side_conversations WHERE ticket_id = ?").all(ticketId) as Array<{ recipients_json: string }>;
  const recipientCount = conversations.reduce((total, conversation) => total + (JSON.parse(conversation.recipients_json) as Recipient[]).length, 0);
  db.prepare("UPDATE tickets SET assigned_agent_id = ? WHERE id = ?").run(agentId, ticketId);
  const suffix = note?.trim() ? ` Note: ${note.trim()}` : "";
  db.prepare("INSERT INTO ticket_events (ticket_id, type, detail, created_at) VALUES (?, 'transferred', ?, ?)")
    .run(ticketId, `Transferred from ${previous} to ${target.name} (${conversations.length} side conversations and ${recipientCount} recipients kept).${suffix}`, new Date().toISOString());
  return { sideConversationCount: conversations.length, recipientCount };
}

export function createSideConversation(ticketId: number, subject: string, recipients: Recipient[], body: string): number {
  getTicketOrThrow(ticketId);
  const assigned = db.prepare("SELECT COALESCE(a.name, 'OpsDesk') AS name FROM tickets t LEFT JOIN agents a ON a.id = t.assigned_agent_id WHERE t.id = ?").get(ticketId) as { name: string };
  const result = db.prepare("INSERT INTO side_conversations (ticket_id, subject, recipients_json) VALUES (?, ?, ?)")
    .run(ticketId, subject.trim(), JSON.stringify(recipients));
  const conversationId = Number(result.lastInsertRowid);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO side_messages (side_conversation_id, sender, body, created_at) VALUES (?, ?, ?, ?)")
    .run(conversationId, assigned.name, body.trim(), now);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, detail, created_at) VALUES (?, 'side_conversation_created', ?, ?)")
    .run(ticketId, `Created side conversation "${subject.trim()}" with ${recipients.length} recipients`, now);
  return conversationId;
}
