import Database from "better-sqlite3";
import { slaWindowMinutes, SlaPriority } from "./sla";

interface CsvResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
}

export interface ExportFilters {
  status?: string;
  priority?: string;
  agent?: string;
  region?: string;
  q?: string;
  from?: string;
  to?: string;
}

const exportSelect = `
  SELECT t.id, t.created_at, a.name AS agency, a.region,
         t.booking_ref, t.intent, t.subject, t.priority, t.status,
         assigned.name AS assigned_agent, t.sla_due_at, t.escalated, t.case_id,
         (SELECT COUNT(*) FROM tickets c WHERE c.case_id = t.case_id) AS contact_count
  FROM tickets t
  LEFT JOIN agencies a ON a.id = t.agency_id
  LEFT JOIN agents assigned ON assigned.id = t.assigned_agent_id
`;

function filterQuery(filters: ExportFilters): { where: string; values: string[] } {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filters.status) { clauses.push("t.status = ?"); values.push(filters.status); }
  if (filters.priority) { clauses.push("t.priority = ?"); values.push(filters.priority); }
  if (filters.agent) { clauses.push("t.assigned_agent_id = ?"); values.push(filters.agent); }
  if (filters.region) { clauses.push("a.region = ?"); values.push(filters.region); }
  if (filters.q) { clauses.push("(t.subject LIKE ? OR a.name LIKE ? OR t.booking_ref LIKE ?)"); values.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`); }
  if (filters.from) { clauses.push("t.created_at >= ?"); values.push(`${filters.from}T00:00:00.000Z`); }
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    clauses.push("t.created_at < ?");
    values.push(end.toISOString());
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function slaStatus(priority: SlaPriority, status: string, dueAt: string | null, now: Date): string {
  if (status === "resolved" || !dueAt) return "ok";
  const minutesLeft = Math.ceil((new Date(dueAt).getTime() - now.getTime()) / 60000);
  if (minutesLeft <= 0) return "breached";
  return minutesLeft <= slaWindowMinutes(priority) * 0.2 ? "at_risk" : "ok";
}

export function getExportStats(database: Database.Database, filters: ExportFilters): number {
  const { where, values } = filterQuery(filters);
  return (database.prepare(`SELECT COUNT(*) AS count FROM tickets t LEFT JOIN agencies a ON a.id = t.agency_id ${where}`).get(...values) as { count: number }).count;
}

function csv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function streamTicketCsv(database: Database.Database, response: CsvResponse, filters: ExportFilters, now = new Date()): void {
  const { where, values } = filterQuery(filters);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="opsdesk-tickets-${now.toISOString().slice(0, 10)}.csv"`);
  response.write("\uFEFF");
  response.write("id,created_at,agency,region,booking_ref,intent,subject,priority,status,assigned_agent,sla_due_at,sla_status,escalated,contact_count,case_id\n");
  const statement = database.prepare(`${exportSelect} ${where}`);
  for (const row of statement.iterate(...values) as Iterable<Record<string, unknown>>) {
    response.write([
      row.id, row.created_at, row.agency, row.region, row.booking_ref, row.intent, row.subject, row.priority,
      row.status, row.assigned_agent, row.sla_due_at, slaStatus(row.priority as SlaPriority, String(row.status), row.sla_due_at as string | null, now),
      row.escalated, row.contact_count, row.case_id
    ].map(csv).join(",") + "\n");
  }
  response.end();
}

export function getExportFilters(query: Record<string, unknown>): ExportFilters {
  const value = (key: string): string | undefined => typeof query[key] === "string" && query[key] ? query[key] as string : undefined;
  return { status: value("status"), priority: value("priority"), agent: value("agent"), region: value("region"), q: value("q"), from: value("from"), to: value("to") };
}
