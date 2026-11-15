import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "./api";

const navItems = [["Dashboard", "/"], ["Tickets", "/tickets"], ["Cases", "/cases"], ["Insights", "/insights"]];

export function Layout() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const createDemo = async () => {
    setBusy(true);
    setDemoError(null);
    try {
      const result = await api.createCriticalDemo();
      navigate(`/tickets/${result.ticket.id}`);
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Could not create demo ticket");
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    setBusy(true);
    setDemoError(null);
    try {
      await api.resetDemo();
      window.location.reload();
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Could not reset demo");
      setBusy(false);
    }
  };

  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="border-b border-slate-800/80 bg-slate-950/90">
      <div className="mx-auto flex max-w-[1440px] items-center gap-8 px-6 py-4">
        <Link to="/" className="flex items-center gap-3 text-lg font-bold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500 text-sm text-white shadow-lg shadow-indigo-500/20">O</span>OpsDesk</Link>
        <nav className="hidden items-center gap-1 md:flex">{navItems.map(([label, path]) => <NavLink key={path} to={path} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"}`}>{label}</NavLink>)}</nav>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/tickets/new" className="rounded-lg bg-indigo-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400">+ New Ticket</Link>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-700 px-3.5 py-2 text-sm text-slate-300 hover:bg-slate-800">Demo <span className="text-slate-500">⌄</span></summary>
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
              <button disabled={busy} onClick={createDemo} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Create critical ticket</button>
              <button disabled={busy} onClick={resetDemo} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Reset demo data</button>
            </div>
          </details>
        </div>
      </div>
    </header>
    {demoError && <div className="mx-auto max-w-[1440px] px-6 pt-4"><div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{demoError}</div></div>}
    <main className="mx-auto max-w-[1440px] px-6 py-8"><Outlet /></main>
  </div>;
}
