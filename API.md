# API Contract — Server ↔ UI

This document is the authoritative contract between `packages/server` and `packages/ui`.
It is derived from `SERVER.md` and `CLIENT.md` and is coordinated by the orchestrator.

## 1. Conventions

- Base URL: `VITE_API_BASE_URL` (UI) / `PORT` (server). All routes are prefixed `/api`.
- Content type: `application/json` for requests and responses.
- All protected routes require: `Authorization: Bearer <supabase_access_token>`.
- All timestamps are ISO-8601 UTC strings (`2026-11-13T09:41:00.000Z`).
- All calendar dates are `YYYY-MM-DD` strings.
- All identifiers are UUID strings.
- The server derives the acting user from the verified access token only. The UI never
  sends `created_by` / `updated_by` / user identifiers.

### 1.1 Error shape

Every non-2xx response uses:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Human readable summary",
    "details": { "optional": "field-level information" }
  }
}
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `bad_request` | Malformed body/query/params, failed validation |
| 401 | `unauthorized` | Missing, invalid, or expired access token |
| 403 | `forbidden` | Authenticated but not allowed (e.g. email not allowlisted) |
| 404 | `not_found` | Resource does not exist (or does not belong to the parent) |
| 409 | `conflict` | Duplicate recipe name |
| 413 / 415 | `invalid_request` | Payload too large / unsupported content type |
| 429 | `too_many_requests` | Request rate exceeded |
| 500 | `internal_error` | Unexpected server failure (no internal details leaked) |

## 2. Data shapes

Field names below are **snake_case** and are the exact JSON keys returned by the API.

### 2.1 Recipe

```json
{
  "id": "uuid",
  "name": "Recipe name",
  "notes": null,
  "url": null,
  "icon": "utensils",
  "created_by": "uuid",
  "updated_by": "uuid",
  "created_at": "2026-11-13T09:41:00.000Z",
  "updated_at": "2026-11-13T09:41:00.000Z",
  "ingredients": [Ingredient]
}
```

- `icon` is one of `utensils`, `fish`, `beef`, or `egg`; it defaults to `utensils` on creation.
- `ingredients` is always present on recipe endpoints that return a recipe.
- `schedules` is **not** present on regular recipe endpoints (see `SERVER.md` §5).
- `created_by` never changes after creation; `updated_by` changes on every modification.

### 2.2 Ingredient

```json
{
  "id": "uuid",
  "recipe_id": "uuid",
  "name": "Flour",
  "quantity": "1/2 cup"
}
```

- `quantity` is free-form text (`"2"`, `"1/2 cup"`, `"1 tbsp"`, `"to taste"`) or `null`.

### 2.3 Schedule

```json
{
  "id": "uuid",
  "recipe_id": "uuid",
  "start_date": "2026-11-10",
  "end_date": "2026-12-03",
  "cook": "J",
  "created_at": "2026-11-13T09:41:00.000Z",
  "updated_at": "2026-11-13T09:41:00.000Z"
}
```

- `cook` is optional and belongs to the **schedule**, not the recipe. It is
  `"J"`, `"H"`, or `null` when unset. The same recipe scheduled on different
  dates may have different cook values.

### 2.4 Calendar recipe

Same as `Recipe`, plus `schedules: Schedule[]`.

Only schedules **overlapping the requested month** are included, and their
`start_date` / `end_date` are returned **unclipped** (original values preserved).

## 3. Endpoints

### 3.1 Authentication

#### `POST /api/auth/magic-link` — *not* session-protected

Request:

```json
{ "email": "user@example.com" }
```

Responses:

| Status | Body |
|---|---|
| 200 | `{ "ok": true }` |
| 400 | Error body — invalid email format, or provider rejected the request |
| 403 | Error body — email is not on the server-side allowlist |

The server checks the allowlist (`ALLOWED_EMAILS`, trimmed + case-insensitive),
fails closed if it is missing/empty, and never discloses the allowlist contents.
On success the provider sends the magic link using `AUTH_CALLBACK_URL` as the
redirect target. The UI completes authentication via the Supabase callback and
establishes the session itself.

### 3.2 Recipes

| Method | Path | Success | Body |
|---|---|---|---|
| GET | `/api/recipes` | 200 | `{ "recipes": Recipe[] }` — all recipes, each with `ingredients` |
| GET | `/api/recipes/:id` | 200 | `{ "recipe": Recipe }` |
| POST | `/api/recipes` | 201 | `{ "recipe": Recipe }` |
| POST | `/api/recipes/with-schedule` | 201 | `{ "recipe": Recipe, "schedule": Schedule }` |
| PATCH | `/api/recipes/:id` | 200 | `{ "recipe": Recipe }` |
| DELETE | `/api/recipes/:id` | 204 | empty |

**`POST /api/recipes` request**

```json
{ "name": "Pancakes", "notes": "Sunday brunch", "url": "https://example.com/pancakes", "icon": "utensils" }
```

- `name` required (unique, 1–255 chars).
- `notes` optional string or `null`.
- `url` optional HTTP(S) URL or `null`; empty string is normalised to `null`.
- `icon` optional, one of `utensils`, `fish`, `beef`, `egg`; defaults to `utensils`.

**`POST /api/recipes/with-schedule` request**

```json
{
  "recipe": { "name": "Pancakes", "notes": null, "url": null, "icon": "utensils" },
  "ingredients": [{ "name": "Flour", "quantity": "1/2 cup" }],
  "schedule": { "start_date": "2026-11-10", "end_date": "2026-11-13" }
}
```

- Created atomically in a single database transaction: if any part fails, nothing
  is committed. A duplicate name yields 409.
- `ingredients` may be omitted or empty.
- `end_date` must not precede `start_date`.

**`PATCH /api/recipes/:id` request**

```json
{
  "name": "Fluffy Pancakes",
  "notes": "Updated notes",
  "url": null,
  "icon": "egg",
  "ingredients": [{ "name": "Flour", "quantity": "1 cup" }]
}
```

- At least one field must be supplied.
- `icon`, when supplied, must be one of `utensils`, `fish`, `beef`, `egg`.
- `ingredients`, when present, **replaces** the recipe's full ingredient set
  atomically together with the recipe fields (add / edit / remove in one save).
- When `ingredients` is omitted, existing ingredients are left untouched.

### 3.3 Ingredients

| Method | Path | Success | Body |
|---|---|---|---|
| GET | `/api/recipes/:id/ingredients` | 200 | `{ "ingredients": Ingredient[] }` |
| POST | `/api/recipes/:id/ingredients` | 201 | `{ "ingredient": Ingredient }` |
| PATCH | `/api/recipes/:id/ingredients/:ingredientId` | 200 | `{ "ingredient": Ingredient }` |
| DELETE | `/api/recipes/:id/ingredients/:ingredientId` | 204 | empty |

The ingredient must belong to the recipe in the path, otherwise 404.

### 3.4 Schedules

| Method | Path | Success | Body |
|---|---|---|---|
| GET | `/api/recipes/:id/schedules` | 200 | `{ "schedules": Schedule[] }` |
| POST | `/api/recipes/:id/schedules` | 201 | `{ "schedule": Schedule }` |
| PATCH | `/api/recipes/:id/schedules/:scheduleId` | 200 | `{ "schedule": Schedule }` |
| DELETE | `/api/recipes/:id/schedules/:scheduleId` | 204 | empty |

Request body for POST / PATCH:

```json
{ "start_date": "2026-11-10", "end_date": "2026-11-13", "cook": "J" }
```

- `end_date` must not precede `start_date` (400).
- `cook` is optional: `"J"`, `"H"`, or `null` to clear it. It may be set or
  changed after the dates are already saved. Omitting it on PATCH leaves the
  stored value untouched.
- Schedules may overlap; no uniqueness constraints apply.

### 3.5 Calendar

#### `GET /api/calendar?month=11&year=2026`

- `month` (1–12) and `year` are **required**; missing or invalid → 400.
- Window = first through last calendar day of the requested month, in `APP_TIMEZONE`.
- A schedule overlaps the window when `start_date <= window_end AND end_date >= window_start`.
- Each overlapping recipe appears exactly once, with its ingredients and all of its
  overlapping schedules (original, unclipped dates).

Response:

```json
{ "recipes": [CalendarRecipe] }
```

### 3.6 Operational

| Method | Path | Success | Body |
|---|---|---|---|
| GET | `/health` | 200 | `{ "ok": true }` — unauthenticated, liveness probe |

## 4. Environment variables

| Variable | Package | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | database, server | yes | PostgreSQL connection string |
| `PORT` | server | no (default `3001`) | HTTP port |
| `SUPABASE_URL` | server, ui | yes | Supabase project URL |
| `SUPABASE_JWT_SECRET` | server | no | Legacy HS256 secret; asymmetric tokens use JWKS |
| `SUPABASE_ANON_KEY` | server | no | Used for provider API calls if no service role key is set |
| `SUPABASE_SERVICE_ROLE_KEY` | server | no | Server-only; never exposed to the UI |
| `ALLOWED_EMAILS` | server | yes | Comma-separated allowlist; server-only |
| `AUTH_CALLBACK_URL` | server | yes | Redirect target used when initiating a magic link |
| `CORS_ORIGIN` | server | yes | Allowed frontend origin |
| `APP_TIMEZONE` | server | yes | IANA timezone used for month-window calculation |
| `VITE_API_BASE_URL` | ui | yes | Server base URL |
| `VITE_SUPABASE_URL` | ui | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ui | yes | Supabase anon key (client-safe) |
| `VITE_AUTH_CALLBACK_URL` | ui | yes | Callback path/route the UI listens on |

At least one of `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is required
on the server. `AUTH_CALLBACK_URL` must have an origin listed in `CORS_ORIGIN`.
User tokens must have the project issuer, `authenticated` audience and role,
a UUID subject, and a valid expiration. Signature verification uses only the
configured HS256 secret or the project's published RS256/ES256 keys.
