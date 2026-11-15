export type SlaPriority = "critical" | "high" | "medium" | "low";

export interface SlaResult {
  priority: SlaPriority;
  sla_minutes: number;
  sla_due_at: string;
}

const windows: Array<{ maxHours: number; priority: SlaPriority; minutes: number }> = [
  { maxHours: 24, priority: "critical", minutes: 15 },
  { maxHours: 72, priority: "high", minutes: 60 },
  { maxHours: 168, priority: "medium", minutes: 240 },
  { maxHours: Infinity, priority: "low", minutes: 1440 }
];

function asDate(value: string | Date): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function dateAtStart(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function computeSla(checkInDate: string, lcdDate: string, now: string | Date): SlaResult {
  const createdAt = asDate(now);
  const anchor = Math.min(dateAtStart(checkInDate).getTime(), dateAtStart(lcdDate).getTime());
  const hoursUntilAnchor = (anchor - createdAt.getTime()) / 3600000;
  const window = windows.find((entry) => hoursUntilAnchor <= entry.maxHours) ?? windows[windows.length - 1];
  return {
    priority: window.priority,
    sla_minutes: window.minutes,
    sla_due_at: new Date(createdAt.getTime() + window.minutes * 60000).toISOString()
  };
}

export function slaWindowMinutes(priority: SlaPriority): number {
  return windows.find((entry) => entry.priority === priority)?.minutes ?? 1440;
}
