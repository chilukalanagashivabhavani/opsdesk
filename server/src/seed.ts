import path from "node:path";
import { databasePath, db, initializeDatabase } from "./db";
import { processTicket } from "./pipeline";
import { computeSla } from "./sla";

export interface SeedResult {
  agencies: number;
  agents: number;
  bookings: number;
  tickets: number;
}

interface TicketSeed {
  bookingIndex: number;
  intent: string;
  ageMinutes?: number;
  fraction?: number;
}

function countRows(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function dateAt(today: Date, days: number): string {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function seedDatabase(seedNow = new Date()): SeedResult {
  initializeDatabase();
  db.exec(`
    DELETE FROM ticket_events;
    DELETE FROM side_messages;
    DELETE FROM side_conversations;
    DELETE FROM messages;
    DELETE FROM tickets;
    DELETE FROM bookings;
    DELETE FROM agents;
    DELETE FROM agencies;
    DELETE FROM sqlite_sequence
    WHERE name IN ('agencies', 'agents', 'bookings', 'tickets', 'messages', 'side_conversations', 'side_messages', 'ticket_events');
  `);

  const agencies = [
    ["GlobeLink Travels", "India", "platinum"], ["Mideast Holidays", "Middle East", "gold"],
    ["EuroVoyage", "Europe", "platinum"], ["Sundial Tours", "SE Asia", "silver"],
    ["Bharat Getaways", "India", "gold"], ["Desert Pearl Travel", "Middle East", "silver"],
    ["Alpine Routes", "Europe", "gold"], ["Island Hopper Co", "SE Asia", "silver"]
  ];
  const insertAgency = db.prepare("INSERT INTO agencies (name, region, tier) VALUES (?, ?, ?)");
  for (const agency of agencies) insertAgency.run(...agency);

  const agents = [
    ["Aarav Mehta", "agent", "India", "08:00", "17:00", 1], ["Nisha Kapoor", "agent", "India", "12:00", "21:00", 1],
    ["Omar Haddad", "agent", "Middle East", "09:00", "18:00", 1], ["Lena Fischer", "agent", "Europe", "07:00", "16:00", 0],
    ["Ravi Tan", "agent", "SE Asia", "10:00", "19:00", 1], ["Sofia Rossi", "agent", "Europe", "14:00", "23:00", 0],
    ["Maya Singh", "agent", "India", "16:00", "01:00", 1], ["Kenji Watanabe", "agent", "SE Asia", "06:00", "15:00", 0],
    ["Priya Shah", "escalation_manager", "India", "09:00", "18:00", 1], ["Daniel Cohen", "escalation_manager", "Middle East", "10:00", "19:00", 1]
  ];
  const insertAgent = db.prepare("INSERT INTO agents (name, role, region, shift_start, shift_end, online) VALUES (?, ?, ?, ?, ?, ?)");
  for (const agent of agents) insertAgent.run(...agent);

  const bookingRefs: string[] = [];
  const bookingAgencyIds: number[] = [];
  const bookingDates: Array<{ checkIn: string; lcd: string }> = [];
  const insertBooking = db.prepare("INSERT INTO bookings (booking_ref, agency_id, hotel_name, destination, check_in_date, lcd_date, amount) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const hotels = ["Taj Palace", "Marina Bay Hotel", "Grand Central", "Riverside Suites", "Azure Resort", "City Garden"];
  const destinations = ["Goa", "Dubai", "Paris", "Singapore", "London", "Bangkok"];
  for (let i = 0; i < 30; i++) {
    const ref = `TBOH${String(123456 + i).padStart(6, "0")}`;
    const checkIn = dateAt(seedNow, i < 4 ? i + 1 : 5 + ((i * 7) % 56));
    const lcd = dateAt(seedNow, i < 4 ? i : 3 + ((i * 7) % 56));
    bookingRefs.push(ref);
    bookingAgencyIds.push((i % 8) + 1);
    bookingDates.push({ checkIn, lcd });
    insertBooking.run(ref, bookingAgencyIds[i], hotels[i % hotels.length], destinations[i % destinations.length], checkIn, lcd, 120 + i * 47.5);
  }

  const intents = ["refund", "cancellation", "amendment", "voucher", "payment", "other"] as const;
  const subjects = ["Refund request", "Cancellation assistance", "Amend booking dates", "Voucher not received", "Payment verification", "Booking question"];
  const ticketsToSeed: TicketSeed[] = [
    { bookingIndex: 0, intent: "refund", ageMinutes: 34 }, { bookingIndex: 0, intent: "refund", ageMinutes: 27 },
    { bookingIndex: 0, intent: "refund", ageMinutes: 20 }, { bookingIndex: 0, intent: "refund", ageMinutes: 13 },
    { bookingIndex: 1, intent: "cancellation", ageMinutes: 14 }, { bookingIndex: 1, intent: "cancellation", ageMinutes: 13 },
    { bookingIndex: 1, intent: "cancellation", ageMinutes: 12 }, { bookingIndex: 2, intent: "amendment", ageMinutes: 58 },
    { bookingIndex: 2, intent: "amendment", ageMinutes: 55 }, { bookingIndex: 2, intent: "amendment", ageMinutes: 50 }
  ];
  for (let bookingIndex = 3; bookingIndex < 30; bookingIndex++) ticketsToSeed.push({ bookingIndex, intent: intents[(bookingIndex + 1) % intents.length] });
  ticketsToSeed.push({ bookingIndex: 0, intent: "voucher", ageMinutes: 13 }, { bookingIndex: 1, intent: "payment" }, { bookingIndex: 2, intent: "other" });

  const resolvedIndexes = new Set([10, 14, 24, 34, 39]);
  const insertTicket = db.prepare("INSERT INTO tickets (agency_id, booking_ref, intent, subject, description, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertMessage = db.prepare("INSERT INTO messages (ticket_id, sender, body, created_at) VALUES (?, ?, ?, ?)");
  const seedNowMs = seedNow.getTime();
  for (let i = 0; i < ticketsToSeed.length; i++) {
    const ticketSeed = ticketsToSeed[i];
    const bookingIndex = ticketSeed.bookingIndex;
    const { checkIn, lcd } = bookingDates[bookingIndex];
    const initialSla = computeSla(checkIn, lcd, seedNow);
    const ageMinutes = ticketSeed.ageMinutes ?? (resolvedIndexes.has(i) ? initialSla.sla_minutes * 0.1 : i === 11 ? initialSla.sla_minutes * 0.9 : initialSla.sla_minutes * 0.2);
    const createdAt = new Date(seedNowMs - ageMinutes * 60000).toISOString();
    const status = resolvedIndexes.has(i) ? "resolved" : "open";
    const agencyId = bookingAgencyIds[bookingIndex];
    const intentIndex = intents.indexOf(ticketSeed.intent as typeof intents[number]);
    const ticket = insertTicket.run(agencyId, bookingRefs[bookingIndex], ticketSeed.intent, subjects[intentIndex], `Agency needs help with ${ticketSeed.intent} for booking ${bookingRefs[bookingIndex]}.`, "low", status, createdAt);
    const ticketId = Number(ticket.lastInsertRowid);
    processTicket(ticketId, createdAt, true);
    insertMessage.run(ticketId, "agency", `Hello, please help with our ${ticketSeed.intent} request.`, createdAt);
    insertMessage.run(ticketId, "system", "Ticket received and awaiting assignment.", new Date(new Date(createdAt).getTime() + 60000).toISOString());
  }

  const sideConversationSeeds = [
    { ticketId: 3, subject: "Confirm refund with Taj Palace", recipients: [{ name: "Anita Rao", email: "anita.rao@tajpalace.example", role: "hotel" }, { name: "GlobeLink Finance", email: "finance@globelink.example", role: "finance" }], messages: ["Could you confirm the refund amount and expected processing date?", "The hotel has confirmed the cancellation. We are checking the final amount."] },
    { ticketId: 4, subject: "Refund approval with finance", recipients: [{ name: "Rahul Menon", email: "rahul.menon@globelink.example", role: "finance" }, { name: "Agency desk", email: "desk@globelink.example", role: "agency" }, { name: "Ops internal", email: "ops@opsdesk.example", role: "internal" }], messages: ["Please review the refund approval for this repeat contact."] },
    { ticketId: 6, subject: "Cancellation confirmation with supplier", recipients: [{ name: "Mina Al-Farsi", email: "mina@supplierops.example", role: "supplier" }, { name: "Mideast Holidays", email: "ops@mideasthol.example", role: "agency" }], messages: ["Please confirm the supplier cancellation reference.", "Supplier reference received; waiting for the penalty breakdown."] },
    { ticketId: 7, subject: "Hotel cancellation confirmation", recipients: [{ name: "Dubai Marina desk", email: "frontdesk@marinabay.example", role: "hotel" }, { name: "Omar Haddad", email: "omar@opsdesk.example", role: "internal" }], messages: ["Checking the final cancellation status with the property."] },
    { ticketId: 9, subject: "Amendment availability with supplier", recipients: [{ name: "Linh Tran", email: "linh@supplierops.example", role: "supplier" }, { name: "Sundial Tours", email: "ops@sundial.example", role: "agency" }], messages: ["Can the supplier hold the new dates while we confirm with the agency?"] },
    { ticketId: 10, subject: "Confirm amended dates with hotel", recipients: [{ name: "Grand Central reservations", email: "reservations@grandcentral.example", role: "hotel" }, { name: "Finance team", email: "finance@eurovoyage.example", role: "finance" }], messages: ["Please confirm availability and any fare difference.", "The hotel is checking inventory for the requested dates.", "Availability is confirmed; finance is validating the difference."] }
  ];
  const insertSideConversation = db.prepare("INSERT INTO side_conversations (ticket_id, subject, recipients_json) VALUES (?, ?, ?)");
  const insertSideMessage = db.prepare("INSERT INTO side_messages (side_conversation_id, sender, body, created_at) VALUES (?, ?, ?, ?)");
  for (const conversation of sideConversationSeeds) {
    const assigned = db.prepare("SELECT COALESCE(assigned.name, 'OpsDesk') AS name FROM tickets t LEFT JOIN agents assigned ON assigned.id = t.assigned_agent_id WHERE t.id = ?").get(conversation.ticketId) as { name: string };
    const created = new Date(seedNowMs + conversation.ticketId * 1000).toISOString();
    const result = insertSideConversation.run(conversation.ticketId, conversation.subject, JSON.stringify(conversation.recipients));
    conversation.messages.forEach((body, index) => insertSideMessage.run(Number(result.lastInsertRowid), index === 0 ? assigned.name : "External partner", body, new Date(new Date(created).getTime() + index * 60000).toISOString()));
  }

  const historical = [
    ["refund", "Refund status follow-up", "The agency is waiting for a refund update."],
    ["voucher", "Voucher delivery question", "The voucher document was not received."]
  ] as const;
  for (let i = 0; i < 25; i++) {
    const [intent, subject, description] = historical[i % historical.length];
    const createdAt = new Date(seedNowMs - ((i * 13) % 14 + 1) * 86400000 - (i % 6) * 3600000).toISOString();
    const bookingIndex = (i + 5) % bookingRefs.length;
    const ticket = insertTicket.run(bookingAgencyIds[bookingIndex], bookingRefs[bookingIndex], intent, subject, description, "low", "resolved", createdAt);
    insertMessage.run(Number(ticket.lastInsertRowid), "agency", `Historical agency message about ${intent}.`, createdAt);
  }

  const result = { agencies: countRows("agencies"), agents: countRows("agents"), bookings: countRows("bookings"), tickets: countRows("tickets") };
  console.log(`Seeded database: ${databasePath}`);
  console.log(`Row counts: agencies=${result.agencies}, agents=${result.agents}, bookings=${result.bookings}, tickets=${result.tickets}`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  seedDatabase();
  db.close();
}
