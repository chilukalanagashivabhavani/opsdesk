import { Agency, Agent, Booking, CaseDetail, CaseSummary, Ticket, TicketEvent } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getAgencies: () => request<Agency[]>("/api/agencies"),
  getAgencyBookings: (agencyId: number) => request<Booking[]>(`/api/agencies/${agencyId}/bookings`),
  getAgents: () => request<Agent[]>("/api/agents"),
  getTickets: () => request<Ticket[]>("/api/tickets"),
  getTicket: (id: number) => request<Ticket>(`/api/tickets/${id}`),
  getTicketCase: (id: number) => request<CaseDetail>(`/api/tickets/${id}/case`),
  getTicketEvents: (id: number) => request<TicketEvent[]>(`/api/tickets/${id}/events`),
  getCases: () => request<CaseSummary[]>("/api/cases"),
  createTicket: (payload: { agency_id: number; booking_ref?: string; intent: string; subject: string; description: string }) =>
    request<Ticket>("/api/tickets", { method: "POST", body: JSON.stringify(payload) }),
  createCriticalDemo: () => request<{ ticket: Ticket; events: TicketEvent[] }>("/api/demo/critical", { method: "POST" }),
  resetDemo: () => request<{ ok: boolean; tickets: number; by_sla_status: Record<string, number> }>("/api/demo/reset", { method: "POST" })
};
