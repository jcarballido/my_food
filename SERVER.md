# Server Package Specification

## 1. Objective

Build the backend API for the recipe application. The server is responsible for authentication, authorization, business logic, database communication, and delivering recipe data to the UI.

The server must ensure that all recipe modifications originate from authenticated users. All authenticated users have equal access to every recipe.

## 2. Technology Stack

- **Runtime:** Node.js
- **Framework:** Fastify
- **Language:** TypeScript
- **Package manager:** pnpm
- **Authentication:** Supabase Auth
- **Database access:** Existing database package using Drizzle ORM
- **API style:** REST
- **HTTP requests:** Standard HTTP conventions

The server agent owns the server package exclusively and may modify its source files, configuration, dependencies, and scripts.

Do not modify the UI or database packages. Coordinate any changes to shared API contracts or database interfaces through the orchestrator.

## 3. Suggested Project Structure

Organize the server package into logical modules. A suggested structure:

- `src/routes` — API route definitions
- `src/controllers` — Request and response handling
- `src/services` — Application business logic
- `src/plugins` — Fastify plugins
- `src/hooks` — Authentication and request lifecycle hooks
- `src/schemas` — Request and response validation schemas
- `src/types` — Server-specific TypeScript types
- `src/utils` — Shared server utilities
- `src/config` — Environment configuration and validation

The agent may adjust this structure when there is a clear architectural reason.

## 4. Authentication and Authorization

### Authentication provider

Use Supabase Auth.

- Magic-link authentication only.
- No password-based authentication.
- Do not implement a separate user authentication system.
- Do not create a local users table unless explicitly requested.

### Email allowlist

The server must restrict authentication initiation to approved email addresses.

Use the server-only environment variable:

`ALLOWED_EMAILS=user1@example.com,user2@example.com`

Requirements:

- Parse the comma-separated values.
- Trim whitespace.
- Compare email addresses case-insensitively.
- Reject emails that are not on the allowlist.
- Fail closed if the variable is missing or improperly configured.
- Never expose the allowlist to the UI.

### Magic-link flow

1. UI submits an email address to the server via `POST /api/auth/magic-link` with `{ "email": "user@example.com" }`.
2. Server normalizes the email and checks the allowlist.
3. If authorized, the server requests a magic link through Supabase Auth using the configured frontend authentication callback URL (environment variable).
4. User completes the magic-link flow through Supabase.
5. UI handles the authentication callback and establishes the authenticated session.
6. Subsequent API requests include the user's access token.
7. Server independently verifies the token before allowing access to protected endpoints.

`POST /api/auth/magic-link` must reject non-allowlisted or invalid emails and must fail closed if allowlist/callback configuration is missing or invalid. This endpoint is not protected by user session auth (it initiates authentication).

### Request authentication

Every protected endpoint must validate the Supabase access token.

Validation must include:

- Token signature.
- Expiration.
- Issuer and audience where applicable.
- Validity of the authenticated identity.

The server must derive the user's identity from the verified token. Never trust a user ID supplied by the UI or request body.

Unauthenticated requests must be rejected.

### Authorization rules

Every authenticated user has full access to every recipe.

There are no owner-only restrictions.

Any authenticated user may:

- Retrieve any recipe.
- Create recipes.
- Modify recipes.
- Delete recipes.
- Add, modify, and remove ingredients.
- Create, modify, and remove recipe schedules.

The original author remains recorded when another user modifies a recipe.

## 5. Recipe Management

The server must support standard recipe CRUD operations.

### Recipe fields

A recipe contains:

- Unique ID.
- Unique name.
- Optional notes.
- Optional URL.
- `created_by` — authenticated user who originally created the recipe.
- `updated_by` — authenticated user who last modified the recipe.
- `created_at`.
- `updated_at`.

### Requirements

- Recipe names must be unique.
- `created_by` is assigned automatically from the authenticated user's identity.
- `updated_by` is assigned automatically from the authenticated user's identity whenever the recipe is modified.
- The UI must not be allowed to set or override these audit fields.
- No historical change tracking is required.

### Recipe endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/recipes` | Retrieve all recipes |
| GET | `/api/recipes/:id` | Retrieve one recipe |
| POST | `/api/recipes` | Create a recipe |
| POST | `/api/recipes/with-schedule` | Create a recipe and its initial schedule atomically |
| PATCH | `/api/recipes/:id` | Modify a recipe |
| DELETE | `/api/recipes/:id` | Delete a recipe |

The regular recipe retrieval endpoints should return recipe information and associated ingredients, but **not schedule dates**. Schedule retrieval is handled separately through the calendar retrieval functionality.

`POST /api/recipes/with-schedule` is a server-supported composite operation. The server must create the recipe and its initial schedule within a single database transaction; if either operation fails, neither must be committed. The request must include the data needed to create the recipe (including ingredients, if provided) and the initial schedule range, and must be validated as one operation. Audit fields (`created_by`, `updated_by`) must be derived from the verified authenticated identity.

## 6. Ingredient Management

Each recipe can have multiple ingredients.

### Ingredient fields

- Unique ID.
- Recipe ID (foreign key).
- Ingredient name.
- Optional quantity.

Quantity must be stored as freeform text to support values such as:

- `2`
- `1/2 cup`
- `1 tbsp`
- `to taste`

### Requirements

- Ingredients must belong to an existing recipe.
- The server must validate that an ingredient being modified or deleted belongs to the specified recipe.
- Deleting a recipe also deletes its associated ingredients.
- Ingredient changes do not require separate author or modification tracking.

### Ingredient endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/recipes/:id/ingredients` | Retrieve ingredients |
| POST | `/api/recipes/:id/ingredients` | Add an ingredient |
| PATCH | `/api/recipes/:id/ingredients/:ingredientId` | Modify an ingredient |
| DELETE | `/api/recipes/:id/ingredients/:ingredientId` | Remove an ingredient |

## 7. Recipe Scheduling

A recipe can have multiple independent schedule ranges.

Each schedule represents a period during which a recipe is scheduled.

### Schedule fields

- Unique ID.
- Recipe ID (foreign key).
- `start_date`.
- `end_date`.
- `created_at`.
- `updated_at`.

### Requirements

- Dates must use calendar-date semantics (`DATE`), not timestamps.
- Multiple schedules can belong to the same recipe.
- Schedule ranges may overlap.
- A recipe can be reused across different date ranges.
- The end date cannot precede the start date.
- Schedule records can be independently created, modified, and deleted.
- Modifying a schedule must not modify the recipe itself.
- Deleting a schedule must not delete its recipe.
- Deleting a recipe also deletes its associated schedules.

### Schedule management endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/recipes/:id/schedules` | Retrieve schedules for one recipe |
| POST | `/api/recipes/:id/schedules` | Create a schedule |
| PATCH | `/api/recipes/:id/schedules/:scheduleId` | Modify a schedule |
| DELETE | `/api/recipes/:id/schedules/:scheduleId` | Delete a schedule |

Dedicated schedule editing and deletion UI is deferred for this iteration, but these server CRUD capabilities must remain implemented and available.

## 8. Calendar Recipe Retrieval

Implement a separate server function/endpoint for retrieving recipes scheduled within a requested calendar month.

Canonical endpoint: `GET /api/calendar?month=11&year=2026`

- Both `month` and `year` query parameters are **required**.
- Validate that `month` and `year` represent a valid calendar month.
- This endpoint is distinct from the regular `GET /api/recipes` endpoint.

### Monthly window

The retrieval window is the first through the last calendar day of the requested month, calculated using the application's configured calendar timezone.

For example, for `month=11&year=2026`:

- Window start: 2026-11-01.
- Window end: 2026-11-30.

Do not use a rolling 30-day window. Calculate the window centrally rather than duplicating logic across routes or services.

### Retrieval logic

Retrieve every recipe that has at least one schedule overlapping the requested calendar month.

A schedule overlaps the window when:

`start_date <= window_end AND end_date >= window_start`

### Important behavior

The server must return the original schedule dates without clipping them to the monthly window.

Examples:

| Schedule range | Include? | Returned range |
|---|---|---|
| October 28 – November 5 | Yes | October 28 – November 5 |
| November 15 – December 3 | Yes | November 15 – December 3 |
| November 1 – November 30 | Yes | November 1 – November 30 |
| December 1 – December 10 | No | — |
| October 1 – October 31 | No | — |

Additional requirements:

- Include each recipe only once, even if multiple schedules overlap the month.
- Return all relevant schedule records for each included recipe.
- Do not truncate schedule ranges at the beginning or end of the month.
- Include the recipe's associated ingredients.
- Do not return recipes that have no schedule overlapping the requested month.
- Keep the regular recipe retrieval endpoint independent of this calendar filtering logic.
- Use ISO `YYYY-MM-DD` strings for schedule `start_date` and `end_date`.

### Response shape

```json
{
  "recipes": [
    {
      "id": "uuid",
      "name": "Recipe name",
      "notes": null,
      "url": null,
      "created_by": "user-id",
      "updated_by": "user-id",
      "created_at": "timestamp",
      "updated_at": "timestamp",
      "ingredients": [],
      "schedules": [
        {
          "id": "uuid",
          "recipe_id": "uuid",
          "start_date": "2026-11-10",
          "end_date": "2026-12-03"
        }
      ]
    }
  ]
}
```

## 9. Database Integration

The server must communicate with the database exclusively through the existing database package.

- Do not create a second database connection implementation.
- Do not import or duplicate database schema definitions.
- Use the database package's existing Drizzle interfaces and operations.
- Coordinate any required database changes through the orchestrator.
- Keep database implementation details out of API responses.

## 10. API Validation and Error Handling

Validate all incoming requests.

Requirements:

- Validate route parameters, request bodies, and query parameters.
- Reject malformed IDs and invalid dates.
- Prevent invalid schedule ranges.
- Handle duplicate recipe names.
- Verify resource relationships before modifying or deleting records.
- Return consistent error response structures.
- Avoid exposing database credentials, SQL details, stack traces, or other internal information.

Use appropriate HTTP status codes:

| Status | Meaning |
|---|---|
| 200 | Successful request |
| 201 | Resource created |
| 204 | Successful deletion |
| 400 | Invalid request |
| 401 | Unauthenticated |
| 403 | Unauthorized |
| 404 | Resource not found |
| 409 | Conflict, such as duplicate recipe name |
| 500 | Internal server error |

## 11. Environment Configuration

Define consistent, coordinated environment variable names across packages and document them in each package's `.env.example`.

Expected server environment variables include (exact names to be finalized consistently during implementation, but must cover):

- `PORT`
- Database configuration required by `@my_food/database` / connection access (e.g. `DATABASE_URL`)
- `SUPABASE_URL`
- Supabase token verification configuration, if/as required (e.g. project/JWT settings)
- `ALLOWED_EMAILS`
- Frontend authentication callback/redirect URL used for magic-link initiation (env var)
- Frontend origin for CORS configuration
- Application calendar timezone used for month-window calculationw

Requirements:

- Validate required environment variables at startup (fail safely/closed when required auth/allowlist/callback config is missing or invalid).
- Keep secrets and server-only values server-side.
- Never commit actual credentials.
- Provide an `.env.example` file.
- Configure CORS to allow the intended frontend origin.
- Keep development and production configuration separate.

## 12. Development Requirements

- Use TypeScript throughout the server package.
- Follow Fastify conventions.
- Keep route handlers lightweight; business logic belongs in services.
- Avoid unnecessary dependencies.
- Use asynchronous operations appropriately.
- Keep API responses consistent.
- Ensure all protected routes use the same authentication mechanism.

Formal testing requirements are deferred for now.

The agent should still verify that the server starts, TypeScript compiles, routes register correctly, authentication works, and database operations function as expected.

## 13. Completion Report

When finished, provide the orchestrator with:

1. Summary of implementation.
2. Files created or modified.
3. Dependencies installed or removed.
4. API routes and their request/response contracts.
5. Environment variables required.
6. Database operations and interfaces used.
7. Authentication and authorization implementation.
8. Monthly calendar retrieval implementation.
9. Build and typecheck results.
10. Outstanding issues or dependencies on other packages.

Do not modify another package to resolve an integration issue. Report the issue to the orchestrator and coordinate the required change.