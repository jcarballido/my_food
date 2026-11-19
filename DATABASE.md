# Database Package — Development Specification

## 1. Role and Responsibilities

The database subagent is responsible for designing, implementing, and maintaining the application's database layer.

Primary responsibilities:
- Define and maintain database schemas.
- Implement database migrations.
- Configure Drizzle ORM.
- Manage database connectivity.
- Define relationships and constraints.
- Provide database access methods for the server package.
- Maintain database integrity.
- Document schema changes.

The database agent operates under the direction of the orchestrator.

## 2. Technology Requirements

Required technologies:
- PostgreSQL
- Drizzle ORM
- TypeScript
- pnpm

Database hosting will be provided by a third-party provider. Supabase is an acceptable example.

## 3. Package Ownership

The database subagent has exclusive ownership of the database package.

The agent may:
- Create and modify database schemas.
- Create and execute migrations.
- Install and remove package dependencies.
- Modify database package configuration.
- Manage database connections.
- Create database queries and access methods.
- Refactor database implementation.

The agent must not:
- Modify the UI or server packages.
- Implement HTTP endpoints.
- Implement frontend functionality.
- Introduce application-level business logic into database access methods.
- Modify authentication provider configuration without orchestrator approval.

## 4. Database Architecture

The application will use PostgreSQL with Drizzle ORM.

Requirements:
- Use UUID primary keys.
- Use explicit foreign-key relationships.
- Use appropriate database constraints.
- Use migrations for all schema changes.
- Keep schema definitions within the database package.
- Keep database credentials server-side.
- Do not expose database connections to the UI.
- Avoid unnecessary tables and abstractions.

## 5. Database Schema

The initial database will contain three primary areas:

1. Recipes
2. Recipe ingredients
3. Recipe scheduling

### 5.1 Recipes

Table: `recipes`

| Column | Type | Requirements |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR | Required, unique |
| notes | TEXT | Optional |
| url | TEXT | Optional |
| icon | VARCHAR | Required, defaults to `utensils`; one of `utensils`, `fish`, `beef`, `egg` |
| created_by | UUID | Required |
| updated_by | UUID | Required |
| created_at | TIMESTAMP | Automatically generated |
| updated_at | TIMESTAMP | Automatically updated |

Requirements:
- Every recipe must have a unique name.
- Notes are optional free-form text.
- URL is optional.
- Icon selects the Lucide glyph shown for the recipe (`utensils`, `fish`, `beef`, or `egg`); new recipes default to `utensils`.
- `created_by` identifies the user who originally created the recipe.
- `updated_by` identifies the user who last modified the recipe.
- User IDs must correspond to IDs supplied by the authentication provider.
- `created_by` must remain unchanged after creation.
- `updated_by` must be updated whenever recipe information is modified.
- No historical change tracking is required.

### 5.2 Recipe Ingredients

Table: `recipe_ingredients`

| Column | Type | Requirements |
|---|---|---|
| id | UUID | Primary key |
| recipe_id | UUID | Required foreign key |
| name | VARCHAR | Required |
| quantity | VARCHAR | Optional |

Requirements:
- Each recipe can have multiple ingredients.
- Each ingredient belongs to exactly one recipe.
- Quantity is optional.
- Quantity must support free-form values such as `2`, `1/2 cup`, `1 tbsp`, or `to taste`.
- Deleting a recipe must automatically delete its associated ingredients.
- Ingredients do not require individual author or modification tracking.

### 5.3 Recipe Scheduling

Table: `recipe_schedules`

| Column | Type | Requirements |
|---|---|---|
| id | UUID | Primary key |
| recipe_id | UUID | Required foreign key |
| start_date | DATE | Required |
| end_date | DATE | Required |
| cook | VARCHAR(1) | Optional; `J`, `H`, or NULL |
| created_at | TIMESTAMP | Automatically generated |
| updated_at | TIMESTAMP | Automatically updated |

Requirements:
- Each recipe can have multiple scheduling records.
- Each scheduling record must belong to one recipe.
- Each record represents an independent starting and ending date range.
- Multiple date ranges may exist for the same recipe.
- Date ranges must be independently editable and deletable.
- Modifying a schedule must not modify the underlying recipe.
- Deleting a schedule must not delete the recipe.
- Deleting a recipe must automatically delete its associated schedules.
- The ending date must not precede the starting date.
- `cook` is optional and attributes a cook to the scheduled meal, not to the recipe.
  It accepts exactly `J` or `H`, or NULL when unassigned (enforced by a check
  constraint).
- The same recipe may carry different `cook` values on different schedule records.
- `cook` may be assigned or changed after the dates are set.
- Use PostgreSQL DATE types because these represent calendar dates rather than timestamps.
- Do not impose restrictions against overlapping date ranges unless explicitly requested.

## 6. Database Relationships

The intended relationships are:

- One recipe has many ingredients.
- One recipe has many scheduling records.
- Each ingredient belongs to one recipe.
- Each scheduling record belongs to one recipe.

No separate user table is required. User identification will rely on the third-party authentication provider.

## 7. Database Access

The database package will provide database connectivity and reusable database access functionality for the server package.

Requirements:
- Use Drizzle ORM for database operations.
- Keep database queries and schema definitions within the database package.
- Expose appropriate database access methods for server consumption, including support for transactional operations required by server workflows (e.g. atomically creating a recipe with ingredients and an initial schedule for `POST /api/recipes/with-schedule`) without embedding application-level business logic or authorization.
- Expose access methods sufficient for recipe/ingredient/schedule CRUD and calendar-month schedule overlap queries as specified by the server contract.
- Do not expose raw database connections to the UI.
- Avoid duplicating business logic between database and server packages.
- The server remains responsible for application-level business rules and authorization.

## 8. Migrations

Requirements:
- Use Drizzle Kit for migration generation and management.
- Maintain migration history.
- Never silently modify an existing production schema.
- Ensure migrations are reproducible.
- Document significant schema changes.
- Coordinate breaking schema changes with the orchestrator.

The database subagent is authorized to create and execute migrations.

## 9. Environment Configuration

The database package must support environment-based configuration.

Requirements:
- Database connection strings and related configuration must come from environment variables with names coordinated consistently across packages.
- Never commit credentials or secrets.
- Provide an `.env.example` documenting required variables.
- Validate required configuration at startup/use as appropriate.
- Support separate development and production database configurations.

## 10. Testing and Validation

Formal testing requirements are deferred.

For now:
- Validate schema definitions.
- Validate migration execution.
- Validate database connectivity.
- Maintain appropriate package build and TypeScript validation scripts.
- Report validation results to the orchestrator.

## 11. Agent Communication

The database subagent must communicate with the orchestrator when:
- A schema change affects server functionality.
- A new relationship or table is required.
- A migration introduces a breaking change.
- Database requirements are ambiguous.
- An architectural decision is required.
- Existing requirements conflict with implementation needs.

The database agent must not independently modify other packages to resolve integration issues.

## 12. Completion Requirements

When completing an assigned task, the database subagent must report:

1. Summary of changes.
2. Tables and columns created or modified.
3. Relationships and constraints introduced.
4. Migrations generated and executed.
5. Dependencies added or removed.
6. Environment variables introduced or modified.
7. Validation results.
8. Outstanding issues or dependencies on other agents.w