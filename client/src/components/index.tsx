import { Link } from "react-router-dom";
import { Priority, SlaStatus, Ticket, TicketEvent } from "../types";
import { useEffect, useState } from "react";

const priorityClasses: Record<Priority, string> = {
  critical: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
  high: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  low: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30"
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${priorityClasses[priority]}`}>{priority}</span>;
}

const slaClasses: Record<SlaStatus, string> = {
  ok: "bg-emerald-500/15 text-emerald-300",
  at_risk: "bg-amber-500/15 text-amber-300",
  breached: "bg-rose-500/15 text-rose-300"
};

function formatCountdown(dueAt: string | null, now: number): { text: string; status: SlaStatus } {
  if (!dueAt) return { text: "No SLA", status: "ok" };
  const diff = new Date(dueAt).getTime() - now;
  const absolute = Math.abs(diff);
  const minutes = Math.floor(absolute / 60000);
  const seconds = Math.floor((absolute % 60000) / 1000);
  if (diff <= 0) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return { text: `Breached ${hours ? `${hours}h ` : ""}${remainingMinutes}m ago`, status: "breached" };
  }
  return { text: `${minutes}m ${String(seconds).padStart(2, "0")}s left`, status: minutes < 30 ? "at_risk" : "ok" };
}

export function SlaBadge({ ticket }: { ticket: Pick<Ticket, "sla_due_at" | "sla_status" | "priority"> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const countdown = formatCountdown(ticket.sla_due_at, now);
  const status = countdown.status === "ok" && ticket.sla_status === "at_risk" ? "at_risk" : countdown.status;
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${slaClasses[status]}`}>{countdown.text}</span>;
}

export function StatCard({ label, value, tone = "indigo" }: { label: string; value: number; tone?: "indigo" | "rose" | "amber" | "emerald" }) {
  const tones = { indigo: "text-indigo-300", rose: "text-rose-300", amber: "text-amber-300", emerald: "text-emerald-300" };
  return <div className="panel"><p className="text-sm text-slate-400">{label}</p><p className={`mt-3 text-3xl font-semibold ${tones[tone]}`}>{value}</p></div>;
}

export function Timeline({ events }: { events: TicketEvent[] }) {
  return <div className="space-y-4">{events.length === 0 ? <EmptyState text="No events recorded yet." /> : events.map((event) => (
    <div key={event.id} className="relative border-l border-slate-700 pl-5">
      <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-indigo-400 ring-4 ring-slate-950" />
      <p className="text-sm font-medium capitalize text-slate-200">{event.type.replace("_", " ")}</p>
      <p className="mt-1 text-sm text-slate-400">{event.detail}</p>
      <time className="mt-1 block text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</time>
    </div>
  ))}</div>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center text-sm text-slate-400">{text}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">{message}</div>;
}

export function LoadingState() {
  return <div className="py-12 text-center text-sm text-slate-400">Loading OpsDesk data...</div>;
}

export function TicketLink({ ticket }: { ticket: { id: number; subject: string } }) {
  return <Link className="font-medium text-indigo-300 hover:text-indigo-200" to={`/tickets/${ticket.id}`}>{ticket.subject}</Link>;
}
