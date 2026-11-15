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

## Phase 5 ticket actions

Run `npm run seed` and `npm run dev`, then open `http://localhost:5173/tickets/3`.

1. In **Side conversations**, note the recipient chips and message history.
2. In **Actions**, choose another agent and click **Transfer**. Confirm the success message, unchanged side conversations, and the `transferred` event.
3. Use **Resolve ticket**, then return to `/tickets`; the ticket appears at the bottom. Open it again and use **Reopen ticket** to restore it.
4. Use **New side conversation**, add a preset recipient, enter a message, and submit. Reply from the conversation thread.

## Phase 6 insights and CSV export

The Insights page works without an API key using the rules engine. If `ANTHROPIC_API_KEY` is configured, it tries the AI engine first and falls back to rules on errors.

Open `http://localhost:5173/insights` to view recurring themes, trend counts, intent totals, and top agencies. Click a theme's sample ticket links to inspect source tickets, or click **Refresh** to bypass the 60-second cache.

On `http://localhost:5173/tickets`, use the filters and click **Export CSV**. The displayed row count follows the active filters. Open the downloaded `opsdesk-tickets-YYYY-MM-DD.csv` file in Excel or VS Code; it includes a UTF-8 BOM and all matching rows.

To verify the export has no row cap:

```bash
npm run test:export
```

The test inserts 10,000 synthetic tickets into an in-memory database and confirms all 10,000 rows are streamed.
