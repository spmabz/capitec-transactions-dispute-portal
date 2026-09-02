# Transactions Dispute Portal

Production-style full-stack submission for the Capitec / WePlace take-home.

## Why this brief

I chose **Transactions Dispute Portal** because it is closest to the Capitec domain and gives room to demonstrate:

- transaction lifecycle thinking
- dispute eligibility rules
- auditable history
- clean full-stack delivery in a self-contained package

## Stack

- Frontend: React 19, Vite, TanStack Query
- Backend: Node.js 22, Express 5, Zod
- Persistence: SQLite via `better-sqlite3`
- Tooling: TypeScript, Vitest, tsup
- Packaging: multi-stage Docker build

## Features

- Demo sign-in with server-issued, expiring sessions
- Customer-scoped API queries and dispute creation
- View seeded transaction history
- Raise disputes against eligible transactions
- Prevent duplicate active disputes
- Historic view of previously disputed transactions
- Status timeline for each dispute
- Automatic progression from `submitted` to `under_review` after intake validation
- Server-side validation and business rules
- Production build that serves the SPA from the API service

## Business rules implemented

- Only `posted` transactions may be disputed
- Transactions older than 60 days are not eligible
- Only one active dispute is allowed per transaction
- Dispute notes require enough detail for investigation
- Every authenticated API request is scoped to the customer identified by its session

## Project structure

```text
src/
  client/   React application
  server/   Express API, repository, seed data
  shared/   Shared TypeScript contracts
  test/     Test setup
```

## Running locally

### Prerequisites

- Node.js 22+
- npm 10+

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`

The database is created automatically in `data/disputes.db` and seeded on first run.

### Demo sign-in

The portal uses seeded demo customers to demonstrate server-enforced customer
scoping. Select a profile on the sign-in screen and use this password:

```text
capitec-demo-2026
```

The available demo profiles are `sifiso@example.com` and `lebo@example.com`.
Each profile can only view and dispute its own transactions. The access token is
stored in browser session storage and expires after eight hours.

To reset it back to the seeded state:

```bash
npm run reset-db
```

If you want to preview what would be removed first:

```bash
node scripts/reset-db.mjs --dry-run
```

### Production build

```bash
npm run build
npm run start
```

The production server serves both the API and the built frontend on port `3000`.

## Docker

The container builds the React frontend and Express API together. It starts with
fresh seeded data on its first run and stores the SQLite database in a named
Docker volume thereafter.

### Recommended: Docker Compose

```bash
docker compose up --build
```

Then open `http://localhost:3000`. Stop it with `Ctrl+C`; the data remains in
the `dispute-portal-data` volume.

To reset Docker data to its initial seeded state:

```bash
docker compose down -v
docker compose up --build
```

### Build

```bash
docker build -t capitec-dispute-portal .
```

### Run

```bash
docker run --rm -p 3000:3000 capitec-dispute-portal
```

Then open `http://localhost:3000`.

The standalone `docker run` command uses temporary in-container data. Add a
volume if you want its data to persist:

```bash
docker run --rm -p 3000:3000 \
  -v capitec-dispute-portal-data:/app/data \
  capitec-dispute-portal
```

## Testing

```bash
npm run check
npm run test
npm run build
```

## API overview

- `GET /api/health`
- `POST /api/session`
- `GET /api/session`
- `DELETE /api/session`
- `GET /api/dashboard`
- `GET /api/transactions`
- `GET /api/disputes`
- `POST /api/disputes`

Example request:

```json
{
  "transactionId": "txn-groceries-001",
  "reasonCode": "unauthorised",
  "description": "I did not authorise this transaction and need it investigated."
}
```

## Notes and tradeoffs

- Seed data is intentionally realistic enough to demo posted, pending, expired, active, resolved, and rejected cases.
- SQLite keeps the project self-contained for evaluation. In a production environment I would move to PostgreSQL and use an external identity provider with secure, httpOnly session cookies.
- The UI is optimized for clarity and reviewer speed rather than broad product scope.

## Future improvements

- dispute evidence uploads
- operator workflow actions
- pagination and search on the API
- structured logging and metrics
