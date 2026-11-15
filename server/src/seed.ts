import { databasePath, db, initializeDatabase } from "./db";

initializeDatabase();
db.exec(`
  DELETE FROM ticket_events;
  DELETE FROM side_conversations;
  DELETE FROM messages;
  DELETE FROM tickets;
  DELETE FROM bookings;
  DELETE FROM agents;
  DELETE FROM agencies;
`);
db.exec(`
  DELETE FROM sqlite_sequence
  WHERE name IN ('agencies', 'agents', 'bookings', 'tickets', 'messages', 'side_conversations', 'ticket_events');
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

const today = new Date();
const dateAt = (days: number): string => {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const bookingRefs: string[] = [];
const insertBooking = db.prepare("INSERT INTO bookings (booking_ref, agency_id, hotel_name, destination, check_in_date, lcd_date, amount) VALUES (?, ?, ?, ?, ?, ?, ?)");
const hotels = ["Taj Palace", "Marina Bay Hotel", "Grand Central", "Riverside Suites", "Azure Resort", "City Garden"];
const destinations = ["Goa", "Dubai", "Paris", "Singapore", "London", "Bangkok"];
for (let i = 0; i < 30; i++) {
  const ref = `TBOH${String(123456 + i).padStart(6, "0")}`;
  bookingRefs.push(ref);
  const checkInDays = i < 4 ? i + 1 : 5 + ((i * 7) % 56);
  insertBooking.run(ref, (i % 8) + 1, hotels[i % hotels.length], destinations[i % destinations.length], dateAt(checkInDays), dateAt(checkInDays - 2), 120 + i * 47.5);
}

const intents = ["refund", "cancellation", "amendment", "voucher", "payment", "other"] as const;
const subjects = ["Refund request", "Cancellation assistance", "Amend booking dates", "Voucher not received", "Payment verification", "Booking question"];
const repeated = [
  [1, 0, "refund"], [1, 0, "refund"], [1, 0, "refund"], [2, 1, "cancellation"],
  [2, 1, "cancellation"], [3, 2, "amendment"], [3, 2, "amendment"], [3, 2, "amendment"]
] as const;
const insertTicket = db.prepare("INSERT INTO tickets (agency_id, booking_ref, intent, subject, description, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const insertMessage = db.prepare("INSERT INTO messages (ticket_id, sender, body, created_at) VALUES (?, ?, ?, ?)");
const createdTicketIds: number[] = [];
for (let i = 0; i < 40; i++) {
  const repeat = repeated[i];
  const agencyId = repeat ? repeat[0] : (i % 8) + 1;
  const bookingIndex = repeat ? repeat[1] : i % 30;
  const intent = repeat ? repeat[2] : intents[i % intents.length];
  const ticket = insertTicket.run(agencyId, bookingRefs[bookingIndex], intent, subjects[intents.indexOf(intent)], `Agency needs help with ${intent} for booking ${bookingRefs[bookingIndex]}.`, i < 4 ? "urgent" : "normal", i % 9 === 0 ? "resolved" : "open", new Date(Date.now() - i * 3600000).toISOString());
  const ticketId = Number(ticket.lastInsertRowid);
  createdTicketIds.push(ticketId);
  insertMessage.run(ticketId, "agency", `Hello, please help with our ${intent} request.`, new Date(Date.now() - i * 3600000).toISOString());
  insertMessage.run(ticketId, "system", "Ticket received and awaiting assignment.", new Date(Date.now() - i * 3600000 + 60000).toISOString());
}
const countRows = (table: string): number => {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
};
console.log(`Seeded database: ${databasePath}`);
console.log(`Row counts: agencies=${countRows("agencies")}, agents=${countRows("agents")}, bookings=${countRows("bookings")}, tickets=${countRows("tickets")}`);
db.close();
