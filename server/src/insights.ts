import { db } from "./db";

export type InsightSource = "ai" | "rules";
export type InsightTrend = "up" | "flat" | "down";

export interface InsightTheme {
  id: string;
  title: string;
  ticket_count: number;
  agency_count: number;
  trend: InsightTrend;
  last_7_days: number;
  previous_7_days: number;
  sample_ticket_ids: number[];
  suggested_action: string;
}

export interface InsightsResponse {
  source: InsightSource;
  themes: InsightTheme[];
  intent_counts: Array<{ intent: string; count: number }>;
  top_agencies: Array<{ agency: string; count: number }>;
}

interface InsightTicket {
  id: number;
  agency_id: number;
  agency_name: string;
  subject: string;
  description: string;
  intent: string;
  status: string;
  created_at: string;
  agency_message: string;
}

interface RuleDefinition {
  id: string;
  title: string;
  keywords: string[];
  suggested_action: string;
}

const ruleDefinitions: RuleDefinition[] = [
  { id: "refunds", title: "Refund delays", keywords: ["refund", "reimburse", "money back"], suggested_action: "Confirm refund ownership and share a clear processing timeline." },
  { id: "cancellations", title: "Cancellation requests", keywords: ["cancel", "cancellation", "penalty"], suggested_action: "Check supplier cancellation terms and send the agency one clear outcome." },
  { id: "amendments", title: "Amendments and date changes", keywords: ["amend", "date change", "change date", "reschedule"], suggested_action: "Validate new inventory and quote any fare difference before replying." },
  { id: "vouchers", title: "Vouchers not received", keywords: ["voucher", "coupon", "document"], suggested_action: "Verify voucher generation and resend the latest document." },
  { id: "payments", title: "Payment and billing questions", keywords: ["payment", "paid", "charge", "invoice", "finance"], suggested_action: "Reconcile the payment reference and respond with the ledger status." },
  { id: "partner-delays", title: "Hotel and supplier delays", keywords: ["hotel", "supplier", "confirmation", "availability", "delay"], suggested_action: "Contact the partner directly and set a next-update time." },
  { id: "urgent-checkin", title: "Urgent check-in support", keywords: ["urgent", "check-in", "check in", "today", "tomorrow"], suggested_action: "Prioritize this booking and contact the property before the next SLA checkpoint." },
  { id: "repeat-contact", title: "Repeat contact on the same booking", keywords: ["repeat", "again", "earlier ticket", "same booking"], suggested_action: "Link the contacts, assign one owner, and send a consolidated update." }
];

let cached: { expiresAt: number; value: InsightsResponse } | null = null;

function trend(last: number, previous: number): InsightTrend {
  if (last > previous) return "up";
  if (last < previous) return "down";
  return "flat";
}

function enrichThemes(definitions: Array<{ id: string; title: string; suggested_action: string; ticketIds: number[] }>, tickets: InsightTicket[], now: Date): InsightTheme[] {
  return definitions.map((definition) => {
    const matched = tickets.filter((ticket) => definition.ticketIds.includes(ticket.id));
    const last7Start = now.getTime() - 7 * 86400000;
    const previous7Start = now.getTime() - 14 * 86400000;
    const last7 = matched.filter((ticket) => new Date(ticket.created_at).getTime() >= last7Start).length;
    const previous7 = matched.filter((ticket) => {
      const created = new Date(ticket.created_at).getTime();
      return created >= previous7Start && created < last7Start;
    }).length;
    return {
      id: definition.id,
      title: definition.title,
      ticket_count: matched.length,
      agency_count: new Set(matched.map((ticket) => ticket.agency_id)).size,
      trend: trend(last7, previous7),
      last_7_days: last7,
      previous_7_days: previous7,
      sample_ticket_ids: matched.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3).map((ticket) => ticket.id),
      suggested_action: definition.suggested_action
    };
  }).filter((theme) => theme.ticket_count > 0).sort((a, b) => b.ticket_count - a.ticket_count);
}

function loadTickets(): InsightTicket[] {
  return db.prepare(`
    SELECT t.id, t.agency_id, a.name AS agency_name, t.subject, t.description, t.intent, t.status, t.created_at,
           COALESCE((SELECT m.body FROM messages m WHERE m.ticket_id = t.id AND m.sender = 'agency' ORDER BY m.created_at LIMIT 1), '') AS agency_message
    FROM tickets t
    JOIN agencies a ON a.id = t.agency_id
    WHERE t.created_at >= datetime('now', '-14 days') OR t.status = 'open'
    ORDER BY t.created_at DESC
  `).all() as InsightTicket[];
}

function buildRulesInsights(tickets: InsightTicket[], now: Date): InsightsResponse {
  const definitions = ruleDefinitions.map((definition) => ({
    id: definition.id,
    title: definition.title,
    suggested_action: definition.suggested_action,
    ticketIds: [] as number[]
  }));
  const assigned = new Set<number>();
  for (const ticket of tickets) {
    const text = `${ticket.subject} ${ticket.description} ${ticket.intent} ${ticket.agency_message}`.toLowerCase();
    const definition = ruleDefinitions.find((candidate) =>
      !assigned.has(ticket.id) && candidate.keywords.some((keyword) => text.includes(keyword))
    );
    if (definition) {
      definitions.find((candidate) => candidate.id === definition.id)?.ticketIds.push(ticket.id);
      assigned.add(ticket.id);
    }
  }
  const intentCounts = new Map<string, number>();
  const agencyCounts = new Map<string, number>();
  for (const ticket of tickets) {
    intentCounts.set(ticket.intent, (intentCounts.get(ticket.intent) ?? 0) + 1);
    agencyCounts.set(ticket.agency_name, (agencyCounts.get(ticket.agency_name) ?? 0) + 1);
  }
  return {
    source: "rules",
    themes: enrichThemes(definitions, tickets, now),
    intent_counts: [...intentCounts.entries()].map(([intent, count]) => ({ intent, count })).sort((a, b) => b.count - a.count),
    top_agencies: [...agencyCounts.entries()].map(([agency, count]) => ({ agency, count })).sort((a, b) => b.count - a.count).slice(0, 5)
  };
}

function parseAiThemes(text: string, tickets: InsightTicket[]): Array<{ id: string; title: string; suggested_action: string; ticketIds: number[] }> | null {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(clean) as { themes?: Array<{ title?: unknown; suggested_action?: unknown; ticket_ids?: unknown }> };
  if (!Array.isArray(parsed.themes) || parsed.themes.length < 4 || parsed.themes.length > 6) return null;
  const knownIds = new Set(tickets.map((ticket) => ticket.id));
  const themes = parsed.themes.map((theme, index) => {
    if (typeof theme.title !== "string" || typeof theme.suggested_action !== "string" || !Array.isArray(theme.ticket_ids)) throw new Error("Invalid AI theme shape");
    const ticketIds = theme.ticket_ids.filter((id): id is number => typeof id === "number" && knownIds.has(id));
    return { id: `ai-${index + 1}`, title: theme.title, suggested_action: theme.suggested_action, ticketIds };
  }).filter((theme) => theme.ticketIds.length > 0);
  return themes.length >= 4 ? themes : null;
}

async function buildAiInsights(tickets: InsightTicket[], now: Date): Promise<InsightsResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const payload = tickets.map(({ id, subject, description, intent, agency_message }) => ({ id, subject, description, intent, agency_message }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: `Group these tickets into 4-6 recurring themes. Return JSON only as {"themes":[{"title":"...","suggested_action":"...","ticket_ids":[1,2]}]}. Every ticket id can appear in at most one theme. Data: ${JSON.stringify(payload)}` }]
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const result = await response.json() as { content?: Array<{ text?: string }> };
    const text = result.content?.[0]?.text;
    if (!text) return null;
    const definitions = parseAiThemes(text, tickets);
    if (!definitions) return null;
    const rules = buildRulesInsights(tickets, now);
    return { ...rules, source: "ai", themes: enrichThemes(definitions, tickets, now) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getInsights(refresh = false): Promise<InsightsResponse> {
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const tickets = loadTickets();
  const now = new Date();
  const value = await buildAiInsights(tickets, now) ?? buildRulesInsights(tickets, now);
  cached = { expiresAt: Date.now() + 60000, value };
  return value;
}
