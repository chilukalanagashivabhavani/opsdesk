import { Agency, Agent, AuditEntry, Booking, CaseDetail, CaseSummary, InsightsResponse, Recipient, RecipientPreset, SideConversation, SideMessage, TeamMember, Ticket, TicketEvent } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("opsdesk_token");
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (response.status === 403) window.dispatchEvent(new CustomEvent("opsdesk:forbidden", { detail: body.error ?? "You do not have permission for this action" }));
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      localStorage.removeItem("opsdesk_token");
      localStorage.removeItem("opsdesk_user");
      window.location.href = "/login";
    }
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) => request<{ token: string; user: import("./auth").AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  demoLogin: (agent_id: number) => request<{ token: string; user: import("./auth").AuthUser }>("/api/auth/demo-login", { method: "POST", body: JSON.stringify({ agent_id }) }),
  getDemoUsers: () => request<Array<Pick<import("./auth").AuthUser, "id" | "name" | "role" | "region">>>("/api/auth/demo-users"),
  getMe: () => request<{ user: import("./auth").AuthUser }>("/api/auth/me"),
  getAgencies: () => request<Agency[]>("/api/agencies"),
  getAgencyBookings: (agencyId: number) => request<Booking[]>(`/api/agencies/${agencyId}/bookings`),
  getAgents: () => request<Agent[]>("/api/agents"),
  getTeam: () => request<TeamMember[]>("/api/team"),
  getTeamAudit: () => request<AuditEntry[]>("/api/team/audit"),
  createTeamMember: (payload: Record<string, unknown>) => request<{ id: number; email: string; password: string }>("/api/team", { method: "POST", body: JSON.stringify(payload) }),
  updateTeamMember: (id: number, payload: Record<string, unknown>) => request<TeamMember>(`/api/team/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  getTickets: (mine = false) => request<Ticket[]>(`/api/tickets${mine ? "?mine=1" : ""}`),
  getTicket: (id: number) => request<Ticket>(`/api/tickets/${id}`),
  getTicketCase: (id: number) => request<CaseDetail>(`/api/tickets/${id}/case`),
  getTicketEvents: (id: number) => request<TicketEvent[]>(`/api/tickets/${id}/events`),
  getSideConversations: (id: number) => request<SideConversation[]>(`/api/tickets/${id}/side-conversations`),
  getRecipientPresets: () => request<RecipientPreset[]>("/api/recipient-presets"),
  getCases: () => request<CaseSummary[]>("/api/cases"),
  getInsights: (refresh = false) => request<InsightsResponse>(`/api/insights${refresh ? "?refresh=1" : ""}`),
  getExportStats: (query: string) => request<{ total_rows: number }>(`/api/export/stats${query ? `?${query}` : ""}`),
  createTicket: (payload: { agency_id: number; booking_ref?: string; intent: string; subject: string; description: string }) =>
    request<Ticket>("/api/tickets", { method: "POST", body: JSON.stringify(payload) }),
  createCriticalDemo: () => request<{ ticket: Ticket; events: TicketEvent[] }>("/api/demo/critical", { method: "POST" }),
  resetDemo: () => request<{ ok: boolean; tickets: number; by_sla_status: Record<string, number> }>("/api/demo/reset", { method: "POST" }),
  updateTicket: (id: number, status: Ticket["status"]) => request<Ticket>(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  transferTicket: (id: number, agent_id: number, note?: string) => request<{ ticket: Ticket; sideConversationCount: number; recipientCount: number }>(`/api/tickets/${id}/transfer`, { method: "POST", body: JSON.stringify({ agent_id, note }) }),
  createSideConversation: (id: number, subject: string, recipients: Recipient[], body: string) => request<{ id: number }>(`/api/tickets/${id}/side-conversations`, { method: "POST", body: JSON.stringify({ subject, recipients, body }) }),
  addSideMessage: (id: number, body: string) => request<SideMessage>(`/api/side-conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) })
};
