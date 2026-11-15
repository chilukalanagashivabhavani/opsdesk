import { SlaPriority } from "./sla";

export interface RoutableTicket {
  priority: SlaPriority;
}

export interface RoutableAgency {
  region: string;
}

export interface RoutableAgent {
  id: number;
  name: string;
  role: "agent" | "escalation_manager";
  region: string;
  shift_start: string;
  shift_end: string;
  online: boolean | number;
}

export interface RoutingResult {
  agent_id: number | null;
  reason: string;
}

function isOnline(agent: RoutableAgent): boolean {
  return agent.online === true || agent.online === 1;
}

function shiftMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isAgentOnShift(agent: RoutableAgent, now: string | Date): boolean {
  const date = now instanceof Date ? now : new Date(now);
  const current = date.getUTCHours() * 60 + date.getUTCMinutes();
  const start = shiftMinutes(agent.shift_start);
  const end = shiftMinutes(agent.shift_end);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function routeTicket(ticket: RoutableTicket, agency: RoutableAgency, agents: RoutableAgent[], openCountByAgent: Map<number, number>, now: string | Date): RoutingResult {
  const onlineAgents = agents.filter((agent) => agent.role === "agent" && isOnline(agent));
  if (onlineAgents.length === 0) return { agent_id: null, reason: "No online agent is available" };

  const onShift = onlineAgents.filter((agent) => isAgentOnShift(agent, now));
  const candidates = onShift.length > 0 ? onShift : onlineAgents;
  const fallback = onShift.length === 0;
  const ranked = candidates.map((agent) => {
    const openCount = openCountByAgent.get(agent.id) ?? 0;
    const sameRegion = agent.region === agency.region;
    const score = (sameRegion ? 40 : 0) + (fallback ? 0 : 30) - openCount * 5 +
      ((ticket.priority === "critical" || ticket.priority === "high") && openCount < 3 ? 10 : 0);
    return { agent, openCount, score, sameRegion };
  }).sort((left, right) => right.score - left.score || left.openCount - right.openCount || left.agent.id - right.agent.id);
  const selected = ranked[0];
  const reasons = [
    selected.sameRegion ? `same region (${agency.region})` : "different region",
    fallback ? "outside shift; least-loaded online agent" : "on shift",
    `${selected.openCount} open ticket${selected.openCount === 1 ? "" : "s"}`
  ];
  return { agent_id: selected.agent.id, reason: `Assigned to ${selected.agent.name}: ${reasons.join(", ")}` };
}
