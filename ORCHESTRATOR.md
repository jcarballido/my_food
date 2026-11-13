# Monorepo Application — Agent Development Specification

## 1. Agent Architecture

### 1.1 Orchestrator Agent
There will be one primary orchestrator agent responsible for coordinating the entire development process.

Responsibilities:
- Understand the overall application architecture and requirements.
- Delegate work to the appropriate package-specific subagent.
- Maintain consistency across packages.
- Coordinate dependencies between packages.
- Review subagent deliverables.
- Resolve conflicts between package implementations.
- Ensure API contracts remain consistent.
- Maintain the overall project specification.

The orchestrator should not independently implement entire packages when a designated subagent exists.

### 1.2 Package Subagents
Each individual package will have its own dedicated subagent.

Responsibilities:
- Understand and maintain its assigned package.
- Implement features within its package boundaries.
- Follow established coding conventions and architectural requirements.
- Communicate required changes to other packages through the orchestrator.
- Validate its implementation before reporting completion.
- Document important implementation decisions.

Subagents have authority to:
- Install and remove package dependencies.
- Modify their package's configuration.
- Modify their package's scripts.
- Create and manage database migrations when applicable.
- Refactor their assigned package.

Subagents must not independently modify other packages without orchestrator coordination.

## 2. Monorepo Architecture

The application will use a pnpm workspace monorepo.

The workspace will contain the following packages:

- `packages/database` — database package
- `packages/server` — server package
- `packages/ui` — UI package

Additional packages may be introduced only when justified by application requirements. Root scripts must support development, building, and typechecking across the workspace.

### 2.1 Package Boundaries
Each package must have:
- A clearly defined responsibility.
- Its own dependencies and configuration.
- A dedicated subagent.
- Explicit boundaries regarding dependencies and external access.
- Its own development scripts.

There will be no dedicated shared package.

Packages must communicate through explicitly defined interfaces rather than importing each other's internal implementation.

Dependency direction:
- UI communicates with the server through HTTP APIs.
- Server accesses the database through the database package.
- Database package owns database connectivity, schemas, and migrations.
- Database credentials and connection logic must never be exposed to the UI.

## 3. Technology Stack

### 3.1 Package Manager
- pnpm
- pnpm workspaces
- Workspace dependencies must use pnpm workspace references where applicable.

### 3.2 UI
Required technologies:
- Vite
- React
- TypeScript
- Tailwind CSS

No Next.js, Remix, or alternative frontend frameworks.

### 3.3 Server
Required technologies:
- Fastify
- TypeScript

The server will act as the application's backend API and primary boundary between the UI and external services.

### 3.4 Database
- Database will be hosted by a third-party provider.
- Supabase is an acceptable example.
- Drizzle ORM will be used.
- Database access will be managed through the server.
- Database schema, migrations, and database-related logic will belong to the database package.

### 3.5 Authentication
- Authentication will be managed by a third-party authentication provider.
- Supabase Auth is an acceptable example.
- Authentication method will be magic-link email authentication.
- Password-based authentication will not be implemented.

## 4. Authentication and Authorization

### 4.1 Login Flow
1. User enters their email address.
2. UI submits the email to the server via `POST /api/auth/magic-link` with `{ "email": "user@example.com" }`.
3. Server checks whether the email is included in the authorized-user allowlist.
4. If authorized, the server initiates a magic-link authentication request through the authentication provider using the configured frontend authentication callback URL (environment variable).
5. User receives an email containing the authentication link.
6. User follows the link and completes authentication through Supabase; the UI handles the authentication callback and session establishment.
7. UI establishes the authenticated session.
8. Server validates the user's authentication token on protected requests.

Unauthorized emails must not be allowed to initiate an authentication flow.

### 4.2 Authorized User Allowlist
The list of authorized users will be defined through a server-side environment variable.

Example:

`ALLOWED_EMAILS=user1@example.com,user2@example.com,user3@example.com`

Requirements:
- Only the server may access this environment variable.
- Emails must be normalized before comparison (trimmed and case-insensitive).
- The server must reject authentication requests from addresses not included in the allowlist.
- The allowlist must never be exposed to the frontend.
- Missing or improperly configured allowlists must cause the server to fail safely.

### 4.3 Session Authorization
- The server must validate authentication tokens independently.
- Protected API endpoints must require an authenticated session.
- Authentication and authorization must remain separate concerns.
- The server must reject expired, invalid, or improperly signed tokens.

## 5. Environment Configuration

Each application package must have clearly defined environment requirements.

Requirements:
- Use consistent, coordinated environment variable names across packages where applicable.
- Secrets must never be committed to source control and must remain server-side.
- Environment variables must be validated at application startup.
- Provide `.env.example` files in each package documenting required variables.
- Server-only secrets must never be exposed through Vite's client-side environment configuration.
- Production and development configurations must be separated.

## 6. Development and Validation

Testing requirements are intentionally deferred.

For now:
- Each subagent is responsible for validating its own implementation.
- Package build and type-check commands should be maintained where applicable.
- The orchestrator is responsible for coordinating integration and reviewing completed work.
- A formal testing strategy will be established in a later specification revision.
