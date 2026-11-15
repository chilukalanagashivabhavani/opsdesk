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
