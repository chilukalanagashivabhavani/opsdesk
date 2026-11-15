export type Priority = "critical" | "high" | "medium" | "low";
export type SlaStatus = "ok" | "at_risk" | "breached";

export interface Agency {
  id: number;
  name: string;
  region: string;
  tier: string;
}

export interface Agent {
  id: number;
  name: string;
  role: "agent" | "escalation_manager";
  region: string;
  shift_start: string;
  shift_end: string;
  online: number;
}

export interface Booking {
  booking_ref: string;
  agency_id: number;
  hotel_name: string;
  destination: string;
  check_in_date: string;
  lcd_date: string;
  amount: number;
}

export interface Message {
  id: number;
  ticket_id: number;
  sender: string;
  body: string;
  created_at: string;
}

export interface TicketEvent {
  id: number;
  ticket_id: number;
  type: "case_linked" | "routed" | "escalated" | string;
  detail: string;
  created_at: string;
}

export interface Ticket {
  id: number;
  agency_id: number;
  booking_ref: string | null;
  intent: string;
  subject: string;
  description: string;
  priority: Priority;
  status: "open" | "pending" | "resolved";
  assigned_agent_id: number | null;
  assigned_agent_name: string | null;
  case_id: string | null;
  contact_count: number;
  sla_due_at: string | null;
  minutes_left: number | null;
  sla_status: SlaStatus;
  escalated: number;
  created_at: string;
  agency_name: string;
  agency_region: string;
  hotel_name: string | null;
  destination: string | null;
  check_in_date: string | null;
  lcd_date: string | null;
  amount: number | null;
  messages?: Message[];
}

export interface CaseSummary {
  case_id: string;
  contact_count: number;
  agency_name: string;
  booking_ref: string;
  intent: string;
  latest_ticket_id: number;
  latest_ticket_status: Ticket["status"];
}

export interface CaseDetail {
  case_id: string;
  contact_count: number;
  first_contact_at: string;
  last_contact_at: string;
  days_span: number;
  tickets: Array<Pick<Ticket, "id" | "subject" | "status" | "created_at">>;
  banner: string | null;
}
