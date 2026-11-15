import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

function App() {
  return <main className="min-h-screen bg-slate-950 px-6 py-24 text-white"><div className="mx-auto max-w-3xl"><p className="mb-4 text-sm font-semibold uppercase tracking-widest text-cyan-400">Travel operations</p><h1 className="text-5xl font-bold">Hello OpsDesk</h1><p className="mt-6 text-lg text-slate-300">A smarter support desk for every booking.</p></div></main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
