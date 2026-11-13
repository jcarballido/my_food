# my_food

A recipe manager and monthly meal planner built as a pnpm workspace monorepo.

The application is composed of three packages with a strict dependency
direction:

```
packages/ui  ──HTTP──▶  packages/server  ──▶  packages/database  ──▶  PostgreSQL
```

- **`packages/ui`** — React + Vite + TypeScript + Tailwind CSS + Zustand frontend.
- **`packages/server`** — Fastify + TypeScript REST API and Supabase authentication.
- **`packages/database`** — PostgreSQL schema, migrations and access methods (Drizzle ORM).

The UI never talks to the database and never sees server-only secrets. The
server is the only component that talks to the database.

## Specifications

| Document | Purpose |
|---|---|
| [`ORCHESTRATOR.md`](ORCHESTRATOR.md) | Monorepo architecture, package boundaries, environment policy |
| [`SERVER.md`](SERVER.md) | Server package specification |
| [`CLIENT.md`](CLIENT.md) | UI package specification |
| [`DATABASE.md`](DATABASE.md) | Database package specification |
| [`API.md`](API.md) | Authoritative HTTP contract between the server and the UI |

## Requirements

- Node.js 20.19+ (or 22.12+)
- pnpm 10
- A PostgreSQL database (Supabase or any hosted PostgreSQL)
- A Supabase project for authentication

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the environment

Each package reads its own `.env` file. Copy the examples and fill in the values:

```bash
cp packages/database/.env.example packages/database/.env
cp packages/server/.env.example   packages/server/.env
cp packages/ui/.env.example        packages/ui/.env
```

| Variable | Where | Notes |
|---|---|---|
| `DATABASE_URL` | database, server | PostgreSQL connection string |
| `SUPABASE_URL` | server | Supabase project URL |
| `SUPABASE_ANON_KEY` | server | Client-safe key |
| `SUPABASE_JWT_SECRET` | server | Optional — JWKS is used when absent |
| `ALLOWED_EMAILS` | server | Comma-separated allowlist; server-only |
| `AUTH_CALLBACK_URL` | server | Magic-link redirect target |
| `CORS_ORIGIN` | server | Allowed browser origin(s) |
| `APP_TIMEZONE` | server | IANA timezone for month-window calculation |
| `VITE_API_BASE_URL` | ui | Base URL of the API server |
| `VITE_SUPABASE_URL` | ui | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ui | Supabase anon key |
| `VITE_AUTH_CALLBACK_URL` | ui | Callback path; must match `AUTH_CALLBACK_URL` |

The server validates its configuration on startup and **fails closed** when a
required variable is missing or malformed.

In Supabase Auth, enable email magic links and add the exact
`AUTH_CALLBACK_URL` to the allowed redirect URLs. Its origin must also appear
in `CORS_ORIGIN` (use the same hostname: `localhost` and `127.0.0.1` are different
origins). The browser uses the implicit callback flow because the server
initiates the email link.

### 3. Apply database migrations

```bash
pnpm db:migrate
```

### 4. Run

```bash
pnpm dev
```

- UI: <http://localhost:5173>
- API: <http://localhost:3001>

## Everyday commands

| Command | Description |
|---|---|
| `pnpm dev` | Run every package in development mode |
| `pnpm build` | Build every package |
| `pnpm typecheck` | Type-check every package |
| `pnpm verify` | Run the server and UI verification suites |
| `pnpm db:generate` | Generate a migration from the schema |
| `pnpm db:migrate` | Apply pending migrations |

## Verification

The specs defer a formal testing strategy, but the implementation ships with
executable verification suites that run against a real database and a real
browser:

```bash
# Server: routing, validation, auth, persistence, calendar semantics (42 checks)
DATABASE_URL=postgresql://... pnpm --filter @my_food/server verify

# UI: calendar layout algorithm (16 checks)
pnpm --filter @my_food/ui verify

# Browser: the real UI in headless Chrome
pnpm --filter @my_food/ui verify:browser        # login screen and error handling
pnpm --filter @my_food/ui verify:browser:app    # calendar, bars, drawer, modal
pnpm --filter @my_food/ui verify:browser:modal  # the two date input methods
```

Use a dedicated test database for verification. The server suite removes its
own fixtures after each run; it does not require real Supabase credentials.
Its successful magic-link test stubs the provider call, so actual email delivery
still needs to be checked against your configured Supabase project.

The browser suites expect the server and UI dev server to be running. Override
their defaults with `UI_URL` and `API_URL`; `CHROME_PATH` selects Chrome. The
authenticated app and modal suites require `TEST_TOKEN` containing a valid
access token, and use the November 2026 calendar fixtures. These browser scripts
exercise the dev server. The app suite removes the recipe it seeds.

### Production hosting

Build with the production `VITE_*` values (Vite embeds them at build time).
Serve `packages/ui/dist` with an SPA fallback to `index.html`, including for
`/auth/callback`; configure the same callback URL in Supabase and on the server.
Start the built API with `pnpm --filter @my_food/server start` and inject its
production environment. Use separate databases and Supabase projects/settings
for development and production.

## Architecture notes

### Authentication

1. The UI posts the email to `POST /api/auth/magic-link`.
2. The server checks the address against the server-side `ALLOWED_EMAILS`
   allowlist (trimmed, case-insensitive) and fails closed if the allowlist is
   missing or empty. Unauthorized addresses never reach the provider.
3. The server asks Supabase to send the magic link, redirecting to
   `AUTH_CALLBACK_URL`.
4. The UI completes the callback and establishes the session.
5. Every protected request carries `Authorization: Bearer <access token>`; the
   server verifies the token independently and derives the acting user from the
   verified token. Audit fields supplied by the client are ignored.

### Calendar retrieval

`GET /api/calendar?month=11&year=2026` returns the recipes scheduled within the
requested calendar month. The window spans the first through the last calendar
day of the month — never a rolling 30-day window — and is calculated once, in
the server. Schedules are returned with their **original, unclipped** dates so
the UI can draw bars that extend beyond the month.

### Data model

`recipes` → `recipe_ingredients` and `recipe_schedules`, both with cascading
deletes. Recipe names are unique. Schedule ranges are constrained so the end
date cannot precede the start date, and schedule dates use PostgreSQL `DATE`
because they are calendar days rather than instants.

### API shape

The wire format is `snake_case` and is documented in [`API.md`](API.md).
Errors always use a single envelope:

```json
{ "error": { "code": "bad_request", "message": "…", "details": {} } }
```
