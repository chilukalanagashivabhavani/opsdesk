import { BarChart3, BriefcaseBusiness, ChevronLeft, ChevronRight, LayoutDashboard, Menu, Plus, RotateCcw, Sparkles, Ticket as TicketIcon, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "./api";
import { Avatar } from "./components";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Tickets", path: "/tickets", icon: TicketIcon },
  { label: "Cases", path: "/cases", icon: BriefcaseBusiness },
  { label: "Insights", path: "/insights", icon: BarChart3 }
];

export function UserCard({ name, role }: { name: string; role: string }) {
  return <div className="flex items-center gap-3 rounded-soft border border-slate-200 bg-slate-50 p-3"><Avatar name={name} size="md" tone="teal" /><div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{name}</p><p className="text-xs text-muted">{role}</p></div></div>;
}

export function Layout() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const runDemo = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true); setDemoError(null);
    try { await action(); } catch (error) { setDemoError(error instanceof Error ? error.message : fallback); } finally { setBusy(false); }
  };
  const createDemo = () => void runDemo(async () => { const result = await api.createCriticalDemo(); navigate(`/tickets/${result.ticket.id}`); }, "Could not create demo ticket");
  const resetDemo = () => void runDemo(async () => { await api.resetDemo(); window.location.reload(); }, "Could not reset demo");
  return <div className="app-shell">
    <button className="fixed left-4 top-4 z-40 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-lg md:hidden" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`}>
      <div className="flex items-center justify-between"><Link to="/" className="flex items-center gap-3 overflow-hidden"><span className="brand-mark"><Sparkles size={19} /></span>{!collapsed && <span className="brand-wordmark">OpsDesk</span>}</Link><button className="sidebar-toggle hidden md:grid" onClick={() => setCollapsed((value) => !value)} aria-label="Collapse sidebar">{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
      <nav className="mt-10 space-y-1">{navItems.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}><Icon size={18} />{!collapsed && <span>{label}</span>}</NavLink>)}</nav>
      {!collapsed && <div className="mt-8"><p className="sidebar-label">Workspace</p><Link to="/tickets/new" onClick={() => setMobileOpen(false)} className="button button-primary mt-3 w-full"><Plus size={17} /> New ticket</Link></div>}
      {!collapsed && <div className="mt-8"><p className="sidebar-label">Demo tools</p><div className="mt-3 space-y-2"><button disabled={busy} onClick={createDemo} className="demo-button"><Sparkles size={15} /> Create critical ticket</button><button disabled={busy} onClick={resetDemo} className="demo-button"><RotateCcw size={15} /> Reset demo data</button></div></div>}
      <div className="mt-auto pt-8">{collapsed ? <Avatar name="Demo Agent" tone="teal" /> : <UserCard name="Demo Agent" role="Operations specialist" />}</div>
    </aside>
    <div className={`main-shell ${collapsed ? "main-shell-expanded" : ""}`}><div className="main-content">{demoError && <div className="error-card mb-5">{demoError}</div>}<Outlet /></div></div>
  </div>;
}
