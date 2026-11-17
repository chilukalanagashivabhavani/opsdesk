import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Inbox, LucideIcon, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Priority, SlaStatus, Ticket, TicketEvent } from "../types";

const priorityClasses: Record<Priority, string> = {
  critical: "badge-critical",
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low"
};

const statusClasses: Record<Ticket["status"], string> = {
  open: "status-open",
  pending: "status-pending",
  resolved: "status-resolved"
};

export function Avatar({ name, size = "md", tone = "indigo" }: { name?: string | null; size?: "sm" | "md" | "lg"; tone?: "indigo" | "teal" | "coral" | "amber" }) {
  const initials = (name ?? "Unassigned").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className={`avatar avatar-${size} avatar-${tone}`} title={name ?? "Unassigned"}>{initials || "?"}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge ${priorityClasses[priority]}`}><span className="badge-dot" />{priority}</span>;
}

export function StatusBadge({ status }: { status: Ticket["status"] }) {
  return <span className={`badge ${statusClasses[status]}`}>{status}</span>;
}

function formatCountdown(dueAt: string | null, now: number): { text: string; status: SlaStatus } {
  if (!dueAt) return { text: "No SLA", status: "ok" };
  const diff = new Date(dueAt).getTime() - now;
  const minutes = Math.floor(Math.abs(diff) / 60000);
  const seconds = Math.floor((Math.abs(diff) % 60000) / 1000);
  if (diff <= 0) return { text: `Breached ${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ""}${minutes % 60}m ago`, status: "breached" };
  return { text: `${minutes}m ${String(seconds).padStart(2, "0")}s`, status: minutes < 30 ? "at_risk" : "ok" };
}

export function SlaBadge({ ticket }: { ticket: Pick<Ticket, "sla_due_at" | "sla_status" | "priority"> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const countdown = formatCountdown(ticket?.sla_due_at ?? null, now);
  const status = countdown.status === "ok" && ticket?.sla_status === "at_risk" ? "at_risk" : countdown.status;
  return <span className={`sla sla-${status}`}><Clock3 size={13} />{countdown.text}</span>;
}

export function SlaProgress({ ticket }: { ticket: Ticket }) {
  const status = ticket.sla_status ?? "ok";
  return <div className="sla-progress-wrap"><div className="flex items-center justify-between"><span className="eyebrow">SLA countdown</span><SlaBadge ticket={ticket} /></div><div className="sla-progress"><span className={`sla-progress-fill sla-fill-${status}`} style={{ width: status === "breached" ? "100%" : status === "at_risk" ? "76%" : "36%" }} /></div><p className="mt-2 text-xs text-muted">{status === "breached" ? "Needs immediate attention" : status === "at_risk" ? "Approaching the response window" : "Within the response window"}</p></div>;
}

export function StatCard({ label, value, tone = "indigo", icon: Icon = Sparkles, caption }: { label: string; value: number; tone?: "indigo" | "rose" | "amber" | "emerald" | "teal"; icon?: LucideIcon; caption?: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const animate = (time: number) => {
      const progress = Math.min((time - start) / 650, 1);
      setDisplayValue(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <article className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={20} /></div><div className="mt-5 text-3xl font-bold tabular-nums text-ink">{displayValue}</div><p className="mt-1 text-sm font-semibold text-ink">{label}</p><p className="mt-1 text-xs text-muted">{caption ?? "Live from your operations queue"}</p></article>;
}

export function PageHeader({ eyebrow, title, detail, actions }: { eyebrow?: string; title: string; detail: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow ?? "OpsDesk"}</p><h1>{title}</h1><p className="page-description">{detail}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function LoadingState() {
  return <div className="space-y-5"><Skeleton className="h-12 w-2/5" /><Skeleton className="h-5 w-3/5" /><div className="grid gap-5 md:grid-cols-3"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div><Skeleton className="h-72" /></div>;
}

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-illustration"><Inbox size={28} /></div><p className="font-semibold text-ink">{text}</p><p className="mt-1 text-sm text-muted">Nothing to show here yet.</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-card"><AlertCircle size={20} /><div className="flex-1"><p className="font-semibold text-rose-900">Something went wrong</p><p className="mt-1 text-sm text-rose-700">{message}</p></div>{onRetry && <button className="button button-danger" onClick={onRetry}><RefreshCw size={15} /> Retry</button>}</div>;
}

export function Timeline({ events }: { events: TicketEvent[] }) {
  const eventIcon = (type: TicketEvent["type"]) => type === "status_changed" ? <CheckCircle2 size={15} /> : type === "escalated" ? <AlertCircle size={15} /> : type === "routed" ? <ArrowRight size={15} /> : <Sparkles size={15} />;
  return <div className="timeline">{(events ?? []).length === 0 ? <EmptyState text="No events recorded yet." /> : (events ?? []).map((event, index) => <div className="timeline-item" key={event.id}><div className={`timeline-dot timeline-dot-${event.type}`}>{eventIcon(event.type)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize text-ink">{event.type.replace(/_/g, " ")}</p><time className="text-xs text-muted">{new Date(event.created_at).toLocaleString()}</time></div><p className="mt-1 text-sm text-muted">{event.detail}</p></div>{index < events.length - 1 && <span className="timeline-line" />}</div>)}</div>;
}
