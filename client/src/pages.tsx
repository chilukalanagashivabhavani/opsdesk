import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import { Agent, Agency, Booking, CaseDetail, Recipient, RecipientPreset, SideConversation, Ticket, TicketEvent } from "./types";
import { EmptyState, ErrorState, LoadingState, PriorityBadge, SlaBadge, StatCard, Timeline } from "./components";
import { usePolling } from "./hooks";

function PageTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm text-slate-400">{detail}</p></div>;
}

function TicketTable({ tickets, onRow }: { tickets: Ticket[]; onRow?: (id: number) => void }) {
  if (tickets.length === 0) return <EmptyState text="No tickets match these filters." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Agency</th><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Intent</th><th className="px-4 py-3">Assigned</th><th className="px-4 py-3">SLA</th><th className="px-4 py-3">Flag</th></tr></thead><tbody className="divide-y divide-slate-800/80">{tickets.map((ticket) => <tr key={ticket.id} onClick={() => onRow?.(ticket.id)} className="cursor-pointer transition hover:bg-slate-800/40"><td className="px-4 py-4"><PriorityBadge priority={ticket.priority} /></td><td className="max-w-[260px] px-4 py-4 font-medium text-slate-100">{ticket.subject}</td><td className="px-4 py-4 text-slate-300">{ticket.agency_name}</td><td className="px-4 py-4 font-mono text-xs text-slate-400">{ticket.booking_ref ?? "-"}</td><td className="px-4 py-4 capitalize text-slate-400">{ticket.intent}</td><td className="px-4 py-4 text-slate-300">{ticket.assigned_agent_name ?? "Unassigned"}</td><td className="px-4 py-4"><SlaBadge ticket={ticket} /></td><td className="px-4 py-4">{ticket.escalated ? <span className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-300">Escalated</span> : <span className="text-slate-600">-</span>}</td></tr>)}</tbody></table></div>;
}

export function Dashboard() {
  const load = useCallback(() => Promise.all([api.getTickets(), api.getCases(), api.getAgents()]), []);
  const { data, loading, error } = usePolling(load, 15000);
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} />;
  const [tickets, cases, agents] = data ?? [[], [], []];
  const open = tickets.filter((ticket) => ticket.status === "open");
  const agentCounts = agents.filter((agent) => agent.role === "agent").map((agent) => ({ agent, count: open.filter((ticket) => ticket.assigned_agent_id === agent.id).length }));
  const maxCount = Math.max(1, ...agentCounts.map(({ count }) => count));
  return <><PageTitle eyebrow="Operations overview" title="Good morning, team" detail="A live view of travel support health, urgency and workload." />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><StatCard label="Open tickets" value={open.length} /><StatCard label="SLA breached" value={tickets.filter((ticket) => ticket.sla_status === "breached").length} tone="rose" /><StatCard label="At risk" value={tickets.filter((ticket) => ticket.sla_status === "at_risk").length} tone="amber" /><StatCard label="Escalated" value={tickets.filter((ticket) => ticket.escalated).length} tone="rose" /><StatCard label="Repeat-contact cases" value={cases.length} tone="emerald" /></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="panel"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Most urgent</h2><p className="mt-1 text-sm text-slate-500">Open tickets closest to their SLA</p></div><Link to="/tickets" className="text-sm text-indigo-300 hover:text-indigo-200">View all</Link></div>{open.length ? <div className="space-y-2">{open.slice(0, 8).map((ticket) => <Link key={ticket.id} to={`/tickets/${ticket.id}`} className="flex items-center gap-4 rounded-lg px-3 py-3 transition hover:bg-slate-800/60"><PriorityBadge priority={ticket.priority} /><span className="min-w-0 flex-1 truncate text-sm text-slate-200">{ticket.subject}</span><span className="hidden text-xs text-slate-500 sm:block">{ticket.agency_name}</span><SlaBadge ticket={ticket} /></Link>)}</div> : <EmptyState text="No open tickets. Nice work." />}</section>
      <section className="panel"><h2 className="font-semibold">Tickets per agent</h2><p className="mt-1 text-sm text-slate-500">Current open workload</p><div className="mt-6 space-y-4">{agentCounts.map(({ agent, count }) => <div key={agent.id}><div className="mb-1 flex justify-between text-sm"><span className="text-slate-300">{agent.name}</span><span className="text-slate-500">{count}</span></div><div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(count / maxCount) * 100}%` }} /></div></div>)}</div></section>
    </div>
  </>;
}

export function TicketsPage() {
  const load = useCallback(() => Promise.all([api.getTickets(), api.getAgents()]), []);
  const { data, loading, error } = usePolling(load, 15000);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [agent, setAgent] = useState("all");
  const [region, setRegion] = useState("all");
  const [search, setSearch] = useState("");
  const [exportCount, setExportCount] = useState<number | null>(null);
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} />;
  const [tickets, agents] = data ?? [[], []];
  const regions = [...new Set(tickets.map((ticket) => ticket.agency_region))].filter(Boolean);
  const filtered = tickets.filter((ticket) => (status === "all" || ticket.status === status) && (priority === "all" || ticket.priority === priority) && (agent === "all" || String(ticket.assigned_agent_id) === agent) && (region === "all" || ticket.agency_region === region) && `${ticket.subject} ${ticket.agency_name} ${ticket.booking_ref ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const exportQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (status !== "all") query.set("status", status);
    if (priority !== "all") query.set("priority", priority);
    if (agent !== "all") query.set("agent", agent);
    if (region !== "all") query.set("region", region);
    if (search) query.set("q", search);
    return query.toString();
  }, [status, priority, agent, region, search]);
  useEffect(() => { api.getExportStats(exportQuery).then((result) => setExportCount(result.total_rows)).catch(() => setExportCount(null)); }, [exportQuery]);
  return <><PageTitle eyebrow="Work queue" title="Tickets" detail="SLA-first triage across every agency and booking." />
    <section className="panel"><div className="mb-5 flex flex-wrap items-end gap-3"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets..." className="input mt-0 min-w-[240px] flex-1" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="input mt-0 w-auto"><option value="all">All statuses</option><option value="open">Open</option><option value="pending">Pending</option><option value="resolved">Resolved</option></select><select value={priority} onChange={(event) => setPriority(event.target.value)} className="input mt-0 w-auto"><option value="all">All priorities</option>{["critical", "high", "medium", "low"].map((item) => <option key={item}>{item}</option>)}</select><select value={region} onChange={(event) => setRegion(event.target.value)} className="input mt-0 w-auto"><option value="all">All regions</option>{regions.map((item) => <option key={item}>{item}</option>)}</select><select value={agent} onChange={(event) => setAgent(event.target.value)} className="input mt-0 w-auto"><option value="all">All agents</option>{agents.filter((item) => item.role === "agent").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => { window.location.href = `/api/export/tickets.csv${exportQuery ? `?${exportQuery}` : ""}`; }} className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2.5 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/20">Export CSV <span className="ml-1 text-indigo-300">{exportCount === null ? "" : `${exportCount} rows`}</span></button></div><TicketTable tickets={filtered} onRow={(id) => { window.location.href = `/tickets/${id}`; }} /></section>
  </>;
}

export function CasesPage() {
  const load = useCallback(() => api.getCases(), []);
  const { data, loading, error } = usePolling(load);
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} />;
  const cases = data ?? [];
  return <><PageTitle eyebrow="Repeat contacts" title="Linked cases" detail="Groups of contacts about the same booking and intent." /><section className="panel overflow-x-auto">{cases.length === 0 ? <EmptyState text="No repeat-contact cases yet." /> : <table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Agency</th><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Intent</th><th className="px-4 py-3">Contacts</th><th className="px-4 py-3">Latest status</th></tr></thead><tbody className="divide-y divide-slate-800/80">{cases.map((item) => <tr key={item.case_id} className="hover:bg-slate-800/40"><td className="px-4 py-4 text-slate-200">{item.agency_name}</td><td className="px-4 py-4"><Link className="font-mono text-xs text-indigo-300" to={`/tickets/${item.latest_ticket_id}`}>{item.booking_ref}</Link></td><td className="px-4 py-4 capitalize text-slate-400">{item.intent}</td><td className="px-4 py-4 font-semibold text-slate-200">{item.contact_count}</td><td className="px-4 py-4 capitalize text-slate-400">{item.latest_ticket_status}</td></tr>)}</tbody></table>}</section></>;
}

export function InsightsPage() {
  const [data, setData] = useState<import("./types").InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async (refresh = false) => { setLoading(true); setError(null); try { setData(await api.getInsights(refresh)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load insights"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} />;
  const maxIntent = Math.max(1, ...(data?.intent_counts.map((item) => item.count) ?? [1]));
  const maxAgency = Math.max(1, ...(data?.top_agencies.map((item) => item.count) ?? [1]));
  const trendIcon = (trend: "up" | "flat" | "down") => trend === "up" ? <span className="text-rose-300">↑</span> : trend === "down" ? <span className="text-emerald-300">↓</span> : <span className="text-slate-400">→</span>;
  return <><div className="mb-7 flex flex-wrap items-end justify-between gap-4"><PageTitle eyebrow="Operational intelligence" title="Insights" detail="Recurring patterns from recent tickets and agency messages." /><div className="flex items-center gap-3"><span className="rounded-full bg-slate-800 px-3 py-1.5 text-xs text-slate-300">{data?.source === "ai" ? "AI-generated" : "Rule-based"}</span><button onClick={() => void load(true)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Refresh</button></div></div>{error && <ErrorState message={error} />} {!data || data.themes.length === 0 ? <EmptyState text="No recurring themes found yet." /> : <><div className="grid gap-4 md:grid-cols-2">{data.themes.map((theme) => <article key={theme.id} className="panel"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{theme.title}</h2><p className="mt-1 text-sm text-slate-500">{theme.ticket_count} tickets · {theme.agency_count} agencies</p></div><span className="text-xl">{trendIcon(theme.trend)}</span></div><div className="mt-4 flex gap-5 text-xs text-slate-400"><span>7 days <strong className="ml-1 text-slate-200">{theme.last_7_days}</strong></span><span>Previous <strong className="ml-1 text-slate-200">{theme.previous_7_days}</strong></span></div><p className="mt-4 rounded-lg bg-slate-800/60 p-3 text-sm leading-5 text-slate-300"><span className="font-medium text-indigo-300">Suggested action:</span> {theme.suggested_action}</p>{theme.sample_ticket_ids.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{theme.sample_ticket_ids.map((id) => <Link key={id} to={`/tickets/${id}`} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-indigo-300 hover:bg-slate-800">Ticket #{id}</Link>)}</div>}</article>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="panel"><h2 className="font-semibold">Tickets by intent</h2><div className="mt-5 space-y-4">{data.intent_counts.map((item) => <div key={item.intent}><div className="mb-1 flex justify-between text-sm"><span className="capitalize text-slate-300">{item.intent}</span><span className="text-slate-500">{item.count}</span></div><div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(item.count / maxIntent) * 100}%` }} /></div></div>)}</div></section><section className="panel"><h2 className="font-semibold">Top agencies</h2><div className="mt-5 space-y-4">{data.top_agencies.map((item) => <div key={item.agency}><div className="mb-1 flex justify-between text-sm"><span className="text-slate-300">{item.agency}</span><span className="text-slate-500">{item.count}</span></div><div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-violet-500" style={{ width: `${(item.count / maxAgency) * 100}%` }} /></div></div>)}</div></section></div></>}</>;
}

function SideConversationCard({ conversation, onReply }: { conversation: SideConversation; onReply: (id: number, body: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    await onReply(conversation.id, body);
    setBody("");
    setSending(false);
  };
  return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium text-slate-200">{conversation.subject}</h3><div className="mt-2 flex flex-wrap gap-2">{conversation.recipients.map((recipient) => <span key={`${recipient.email}-${recipient.role}`} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{recipient.name} · {recipient.role}</span>)}</div></div><span className="text-xs text-slate-500">{conversation.message_count} messages</span></div><div className="mt-4 space-y-2">{conversation.messages.map((message) => <div key={message.id} className="rounded-lg bg-slate-900 px-3 py-2"><div className="flex justify-between text-xs"><span className="text-indigo-300">{message.sender}</span><span className="text-slate-600">{new Date(message.created_at).toLocaleString()}</span></div><p className="mt-1 text-sm text-slate-300">{message.body}</p></div>)}</div><form onSubmit={submit} className="mt-3 flex gap-2"><input value={body} onChange={(event) => setBody(event.target.value)} className="input mt-0" placeholder="Reply to this conversation..." /><button disabled={sending || !body.trim()} className="rounded-lg bg-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50">{sending ? "..." : "Reply"}</button></form></div>;
}

function NewSideConversationForm({ presets, onCreated }: { presets: RecipientPreset[]; onCreated: (subject: string, recipients: Recipient[], body: string) => Promise<void> }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [customRole, setCustomRole] = useState<Recipient["role"]>("internal");
  const [sending, setSending] = useState(false);
  const addRecipients = (next: Recipient[]) => setRecipients((current) => [...current, ...next.filter((item) => !current.some((existing) => existing.email === item.email))]);
  const addCustom = () => {
    if (customName.trim() && customEmail.trim()) {
      addRecipients([{ name: customName.trim(), email: customEmail.trim(), role: customRole }]);
      setCustomName("");
      setCustomEmail("");
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !body.trim() || recipients.length === 0) return;
    setSending(true);
    await onCreated(subject, recipients, body);
    setSubject("");
    setBody("");
    setRecipients([]);
    setSending(false);
  };
  return <form onSubmit={submit} className="rounded-xl border border-dashed border-slate-700 p-4"><h3 className="font-medium text-slate-200">New side conversation</h3><input required value={subject} onChange={(event) => setSubject(event.target.value)} className="input" placeholder="Subject" /><div className="mt-3 flex flex-wrap gap-2">{presets.map((preset) => <button type="button" key={preset.name} onClick={() => addRecipients(preset.recipients)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">+ {preset.name}</button>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"><input value={customName} onChange={(event) => setCustomName(event.target.value)} className="input mt-0" placeholder="Custom name" /><input value={customEmail} onChange={(event) => setCustomEmail(event.target.value)} className="input mt-0" placeholder="Email" /><select value={customRole} onChange={(event) => setCustomRole(event.target.value as Recipient["role"])} className="input mt-0">{["hotel", "supplier", "finance", "agency", "internal"].map((role) => <option key={role}>{role}</option>)}</select><button type="button" onClick={addCustom} className="rounded-lg bg-slate-700 px-3 text-sm hover:bg-slate-600">Add</button></div><div className="mt-3 flex flex-wrap gap-2">{recipients.map((recipient) => <span key={recipient.email} className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-200">{recipient.name} · {recipient.role}</span>)}</div><textarea required rows={3} value={body} onChange={(event) => setBody(event.target.value)} className="input resize-none" placeholder="First message..." /><button disabled={sending || recipients.length === 0} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50">{sending ? "Sending..." : "Start conversation"}</button></form>;
}

export function TicketDetailPage() {
  const { id } = useParams();
  const ticketId = Number(id);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [sideConversations, setSideConversations] = useState<SideConversation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [presets, setPresets] = useState<RecipientPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transferAgent, setTransferAgent] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [working, setWorking] = useState(false);
  const loadTicket = useCallback(async () => {
    const [nextTicket, nextEvents, nextCase, nextConversations, nextAgents, nextPresets] = await Promise.all([api.getTicket(ticketId), api.getTicketEvents(ticketId), api.getTicketCase(ticketId), api.getSideConversations(ticketId), api.getAgents(), api.getRecipientPresets()]);
    setTicket(nextTicket);
    setEvents(nextEvents);
    setCaseDetail(nextCase);
    setSideConversations(nextConversations);
    setAgents(nextAgents);
    setPresets(nextPresets);
  }, [ticketId]);
  useEffect(() => {
    let active = true;
    loadTicket()
      .then(() => { if (!active) return; })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load ticket"); });
    return () => { active = false; };
  }, [loadTicket]);
  if (error) return <ErrorState message={error} />;
  if (!ticket || !caseDetail) return <LoadingState />;
  const routedEvent = events.find((event) => event.type === "routed");
  const perform = async (action: () => Promise<void>, message: string) => { setWorking(true); setActionError(null); setSuccess(null); try { await action(); await loadTicket(); setSuccess(message); } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Action failed"); } finally { setWorking(false); } };
  const reply = (conversationId: number, body: string) => perform(async () => { await api.addSideMessage(conversationId, ticket.assigned_agent_name ?? "OpsDesk", body); }, "Reply added.");
  const createConversation = (subject: string, recipients: Recipient[], body: string) => perform(async () => { await api.createSideConversation(ticket.id, subject, recipients, body); }, "Side conversation created.");
  const transfer = async () => {
    if (!transferAgent) return;
    setWorking(true);
    setActionError(null);
    setSuccess(null);
    try {
      const result = await api.transferTicket(ticket.id, Number(transferAgent), transferNote);
      setTransferNote("");
      setTransferAgent("");
      await loadTicket();
      setSuccess(`Transferred. ${result.sideConversationCount} side conversations and ${result.recipientCount} recipients kept.`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Transfer failed");
    } finally {
      setWorking(false);
    }
  };
  return <><Link to="/tickets" className="text-sm text-slate-500 hover:text-slate-300">← Back to tickets</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-3"><PriorityBadge priority={ticket.priority} /><span className="capitalize text-sm text-slate-400">{ticket.status}</span></div><h1 className="mt-3 text-3xl font-semibold">{ticket.subject}</h1><p className="mt-2 text-sm text-slate-500">Ticket #{ticket.id} · created {new Date(ticket.created_at).toLocaleString()}</p></div><div className="flex flex-wrap justify-end gap-3"><div className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 text-center"><p className="text-xs uppercase tracking-widest text-slate-500">SLA countdown</p><div className="mt-2 text-xl font-semibold"><SlaBadge ticket={ticket} /></div></div><section className="panel min-w-[280px] p-4"><h2 className="text-sm font-semibold">Actions</h2><button disabled={working} onClick={() => void perform(() => api.updateTicket(ticket.id, ticket.status === "resolved" ? "open" : "resolved").then(() => undefined), ticket.status === "resolved" ? "Ticket reopened." : "Ticket resolved.")} className="mt-3 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50">{ticket.status === "resolved" ? "Reopen ticket" : "Resolve ticket"}</button><div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><select value={transferAgent} onChange={(event) => setTransferAgent(event.target.value)} className="input mt-0"><option value="">Transfer to...</option>{agents.filter((agent) => agent.id !== ticket.assigned_agent_id).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role.replace("_", " ")}</option>)}</select><button disabled={working || !transferAgent} onClick={() => void transfer()} className="rounded-lg bg-slate-700 px-3 text-sm hover:bg-slate-600 disabled:opacity-50">Transfer</button></div><input value={transferNote} onChange={(event) => setTransferNote(event.target.value)} className="input" placeholder="Transfer note (optional)" /></section></div></div>
    {(success || actionError) && <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${actionError ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>{actionError ?? success}</div>}
    {caseDetail.banner && <div className="mt-6 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-indigo-200">↗ {caseDetail.banner}</div>}
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"><div className="space-y-6"><section className="panel"><h2 className="mb-4 font-semibold">Booking context</h2><div className="grid gap-4 sm:grid-cols-2">{[["Hotel", ticket.hotel_name], ["Destination", ticket.destination], ["Check-in", ticket.check_in_date], ["LCD", ticket.lcd_date], ["Amount", ticket.amount === null ? "-" : `₹${ticket.amount.toLocaleString()}`], ["Agency", `${ticket.agency_name} · ${ticket.agency_region}`]].map(([label, value]) => <div key={label}><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-200">{value ?? "-"}</p></div>)}</div></section><section className="panel"><h2 className="mb-4 font-semibold">Case timeline <span className="ml-2 text-sm font-normal text-slate-500">{caseDetail.contact_count} contacts</span></h2><div className="space-y-3">{caseDetail.tickets.map((item) => <Link key={item.id} to={`/tickets/${item.id}`} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${item.id === ticket.id ? "border-indigo-500/50 bg-indigo-500/10" : "border-slate-800 hover:bg-slate-800/50"}`}><span className="font-mono text-xs text-slate-500">#{item.id}</span><span className="min-w-0 flex-1 truncate text-sm text-slate-200">{item.subject}</span><span className="text-xs capitalize text-slate-500">{item.status}</span></Link>)}</div></section><section className="panel"><h2 className="mb-4 font-semibold">Messages</h2><div className="space-y-4">{ticket.messages?.map((message) => <div key={message.id} className="rounded-xl bg-slate-800/60 p-4"><div className="flex justify-between text-xs"><span className="font-semibold capitalize text-indigo-300">{message.sender}</span><time className="text-slate-500">{new Date(message.created_at).toLocaleString()}</time></div><p className="mt-2 text-sm leading-6 text-slate-300">{message.body}</p></div>)}</div></section></div><div className="space-y-6"><section className="panel"><h2 className="font-semibold">Why assigned</h2><p className="mt-3 text-sm leading-6 text-slate-400">{routedEvent?.detail ?? "No routing explanation recorded."}</p><p className="mt-4 text-xs text-slate-500">Assigned agent</p><p className="mt-1 text-sm text-slate-200">{ticket.assigned_agent_name ?? "Unassigned"}</p></section><section className="panel"><h2 className="mb-5 font-semibold">Event history</h2><Timeline events={events} /></section></div></div><section className="panel mt-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Side conversations</h2><p className="mt-1 text-sm text-slate-500">Partner threads stay with this ticket through transfers.</p></div><span className="text-sm text-slate-500">{sideConversations.length} conversations</span></div><div className="space-y-4">{sideConversations.length ? sideConversations.map((conversation) => <SideConversationCard key={conversation.id} conversation={conversation} onReply={reply} />) : <EmptyState text="No side conversations yet." />}<NewSideConversationForm presets={presets} onCreated={createConversation} /></div></section></>;
}

export function NewTicketPage() {
  const navigate = useNavigate();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [agencyId, setAgencyId] = useState("");
  const [form, setForm] = useState({ booking_ref: "", intent: "refund", subject: "", description: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.getAgencies().then(setAgencies).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load agencies")); }, []);
  useEffect(() => {
    if (!agencyId) { setBookings([]); return; }
    api.getAgencyBookings(Number(agencyId)).then(setBookings).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load bookings"));
  }, [agencyId]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const ticket = await api.createTicket({ agency_id: Number(agencyId), ...form, booking_ref: form.booking_ref || undefined });
      navigate(`/tickets/${ticket.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create ticket");
      setLoading(false);
    }
  };
  return <><PageTitle eyebrow="New work item" title="Create a ticket" detail="Capture the request and let OpsDesk route it with booking-aware urgency." />{error && <ErrorState message={error} />}<form onSubmit={submit} className="panel max-w-3xl space-y-5"><div className="grid gap-5 sm:grid-cols-2"><label className="field">Agency<select required value={agencyId} onChange={(event) => { setAgencyId(event.target.value); setForm((current) => ({ ...current, booking_ref: "" })); }} className="input"><option value="">Select agency</option>{agencies.map((agency) => <option value={agency.id} key={agency.id}>{agency.name} · {agency.region}</option>)}</select></label><label className="field">Booking<select value={form.booking_ref} onChange={(event) => setForm((current) => ({ ...current, booking_ref: event.target.value }))} className="input" disabled={!agencyId}><option value="">No booking selected</option>{bookings.map((booking) => <option value={booking.booking_ref} key={booking.booking_ref}>{booking.booking_ref} · {booking.destination}</option>)}</select></label></div><label className="field">Intent<select value={form.intent} onChange={(event) => setForm((current) => ({ ...current, intent: event.target.value }))} className="input">{["refund", "cancellation", "amendment", "voucher", "payment", "other"].map((intent) => <option key={intent}>{intent}</option>)}</select></label><label className="field">Subject<input required value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} className="input" placeholder="What does the agency need help with?" /></label><label className="field">Description<textarea required rows={6} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="input resize-none" placeholder="Add the details the operations team needs..." /></label><button disabled={loading} className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50">{loading ? "Creating..." : "Create and route ticket"}</button></form></>;
}
