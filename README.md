# OpsDesk

OpsDesk is a travel-aware B2B ticketing platform foundation.

## Setup

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run seed
npm run dev
```

The API runs at `http://localhost:3000` and the client at `http://localhost:5173`.
The SQLite database is created at `server/data/opsdesk.db` automatically.

## API examples

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/tickets
```

Create a ticket:

```bash
curl -X POST http://localhost:3000/api/tickets -H "Content-Type: application/json" -d "{\"agency_id\":1,\"booking_ref\":\"TBOH123456\",\"intent\":\"refund\",\"subject\":\"Refund status\",\"description\":\"Please share the refund timeline.\"}"
```

## Phase 2 browser verification

After running `npm run seed` and `npm run dev`, open these URLs in a browser:

- `http://localhost:3000/api/cases`
- `http://localhost:3000/api/tickets/3/case`
- `http://localhost:3000/api/tickets`
- `http://localhost:3000/api/tickets/3`

## Phase 3 browser verification

The server now computes travel-aware SLA priority, routes tickets to online agents, and escalates at-risk tickets.

Open these URLs after `npm run seed` and `npm run dev`:

- `http://localhost:3000/api/tickets`
- `http://localhost:3000/api/tickets/3/events`

To trigger the critical demo ticket from PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/demo/critical
```

The response includes the created ticket, assigned agent, SLA fields, and event history.

Reset the demo data in-process:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/demo/reset
```

The reset response reports the ticket count and SLA mix. To count the live API response by SLA status:

```powershell
(Invoke-RestMethod http://localhost:3000/api/tickets | Group-Object sla_status | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ", "
```
