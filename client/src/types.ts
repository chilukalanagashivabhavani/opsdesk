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
  type: "case_linked" | "routed" | "escalated" | "status_changed" | "transferred" | "side_conversation_created" | string;
  detail: string;
  created_at: string;
}

export type RecipientRole = "hotel" | "supplier" | "finance" | "agency" | "internal";

export interface Recipient {
  name: string;
  email: string;
  role: RecipientRole;
}

export interface SideMessage {
  id: number;
  side_conversation_id: number;
  sender: string;
  body: string;
  created_at: string;
}

export interface SideConversation {
  id: number;
  ticket_id: number;
  subject: string;
  recipients: Recipient[];
  messages: SideMessage[];
  message_count: number;
}

export interface RecipientPreset {
  name: string;
  recipients: Recipient[];
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
  case_id: string | null;
  contact_count: number;
  first_contact_at: string | null;
  last_contact_at: string | null;
  days_span: number;
  tickets: Array<Pick<Ticket, "id" | "subject" | "status" | "created_at">>;
  banner: string | null;
}

export interface InsightTheme {
  id: string;
  title: string;
  ticket_count: number;
  agency_count: number;
  trend: "up" | "flat" | "down";
  last_7_days: number;
  previous_7_days: number;
  sample_ticket_ids: number[];
  suggested_action: string;
}

export interface InsightsResponse {
  source: "ai" | "rules";
  themes: InsightTheme[];
  intent_counts: Array<{ intent: string; count: number }>;
  top_agencies: Array<{ agency: string; count: number }>;
}
