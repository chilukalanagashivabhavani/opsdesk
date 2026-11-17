import { Component, ErrorInfo, ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./App";
import { CasesPage, Dashboard, InsightsPage, LoginPage, NewTicketPage, TeamPage, TicketDetailPage, TicketsPage } from "./pages";
import { AuthProvider, useAuth } from "./auth";
import { LoadingState } from "./components";
import "./index.css";

type ErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled application error", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return <main className="min-h-screen bg-[#FAFAFC] px-6 py-12 text-slate-900"><div className="mx-auto max-w-2xl rounded-[20px] border border-rose-200 bg-white p-6 shadow-xl"><h1 className="text-xl font-semibold text-rose-900">OpsDesk could not display this page</h1><p className="mt-3 text-sm text-rose-700">{this.state.error.message || "An unexpected error occurred."}</p></div></main>;
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/new" element={<NewTicketPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/team" element={<TeamPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>
);
