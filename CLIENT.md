# UI Package Specification

## 1. Objective

Build the frontend application for a recipe management and monthly calendar system.

The UI is responsible for:

1. Displaying a traditional monthly calendar.
2. Displaying all saved recipes.
3. Displaying recipe details, including notes, URL, and ingredients.
4. Allowing users to schedule recipes across date ranges.
5. Allowing users to create, edit, and delete recipes.
6. Displaying scheduled recipes as continuous bars across calendar dates.
7. Supporting calendar navigation between months.
8. Communicating with the server through its HTTP API.

The application should prioritize a clean, intuitive interface with minimal friction when managing recipes and schedules.

## 2. Technology Stack

- **Framework:** React
- **Language:** TypeScript
- **Build tool:** Vite
- **CSS:** Tailwind CSS
- **State management:** Zustand
- **Package manager:** pnpm
- **HTTP requests:** Native Fetch API
- **Authentication:** Supabase Auth

### Restrictions

- Do not introduce Next.js, Remix, or another frontend framework.
- Do not use Axios, Ky, or another HTTP client library.
- Do not use React Hook Form or Formik.
- Do not introduce a third-party component library.
- Build reusable UI components internally.
- Use functional React components and hooks.

## 3. Application Layout

The primary application view consists of:

- A monthly calendar occupying the main content area.
- A collapsible recipe panel/drawer.
- A modal for scheduling recipes and optionally creating new recipes.

The calendar should remain the primary focus of the application.

### Recipe drawer

The drawer provides access to all saved recipes.

Requirements:

- Display a list of saved recipes.
- Allow users to select a recipe.
- Selecting a recipe displays its details as another section within the drawer.
- Recipe details include name, notes, URL, and ingredients.
- Provide controls to edit and delete the selected recipe.
- Support collapsing and expanding the drawer.
- Do not provide a scheduling action within the drawer. Scheduling is initiated exclusively through the calendar.

Dedicated schedule editing and deletion UI is deferred for this iteration (server/database CRUD capabilities remain available for future work).

The recipe list and recipe details should not require separate application pages.

## 4. Monthly Calendar

### Layout

Use a traditional monthly calendar layout:

- Seven columns representing Sunday through Saturday.
- Rows representing calendar weeks.
- Display the month and year.
- Display individual calendar dates.
- Accommodate months that require four, five, or six calendar rows.

### Navigation

Users must be able to navigate between months.

Requirements:

- Previous-month navigation.
- Next-month navigation.
- Display the currently selected month and year.
- Load the appropriate calendar data whenever the displayed month changes.
- Do not restrict navigation to the current month.

### Recipe display

Recipes scheduled on the calendar must appear as continuous bars spanning their scheduled dates.

For example, a recipe scheduled November 10–13 should appear as one continuous bar across those four calendar dates rather than four separate recipe labels.

Requirements:

- Display the recipe name on the bar.
- Extend the bar across all applicable dates.
- Support schedules that cross calendar weeks.
- Support schedules that cross calendar months.
- Display multiple recipes on the same date by stacking them vertically.
- Maintain clear visual separation between different recipes.
- Ensure recipe names remain readable within the available space.

When a recipe bar is clicked, open that recipe's details in the recipe drawer.

### Empty calendar dates

Clicking an empty calendar date opens the scheduling modal.

The selected date must automatically populate the modal's start date.

## 5. Scheduling Modal

The scheduling modal is the only entry point for creating recipe schedules.

It must support two workflows:

1. Scheduling an existing recipe.
2. Creating a new recipe and scheduling it immediately.

### Existing recipe workflow

When the modal opens:

- Allow the user to select an existing recipe from a dropdown.
- Allow the user to define the schedule.
- If opened by clicking a calendar date, prepopulate the start date with that date.
- Save the schedule against the selected recipe.

### New recipe workflow

Allow the user to create a new recipe directly within the scheduling modal.

Recipe creation fields:

- Name (required and unique).
- Notes (optional).
- URL (optional).
- Ingredients (optional, with optional quantities).

After the recipe is created, allow the user to define its schedule and save the schedule.

Use the server-supported composite operation `POST /api/recipes/with-schedule` to create the recipe and its initial schedule as a single logical workflow. The server must perform this operation within a single database transaction so that if either operation fails, neither is committed. The UI must treat this as one operation and handle failures appropriately so that it does not incorrectly report success.

### Date selection

Users must be able to define a schedule using either of two methods.

**Method A: Start date and end date**

- User selects a start date.
- User selects an end date.
- UI calculates the duration automatically.

**Method B: Start date and duration**

- User selects a start date.
- User enters the number of days.
- UI calculates the end date automatically.

The two methods must produce equivalent results.

Duration includes both the start and end dates.

For example:

- Start date: November 10.
- Duration: 4 days.
- Calculated end date: November 13.

The user should be able to switch between the two methods without losing the selected start date.

### Date validation

- Start date is required.
- Duration must be a positive whole number.
- End date cannot precede start date.
- Changing the start date or duration must recalculate the dependent date.
- Prevent invalid schedules from being submitted.

## 6. Recipe Management

Users must be able to create, view, edit, and delete recipes.

### Recipe creation

The recipe name is the only required field.

Optional fields:

- Notes.
- URL.
- Ingredients.

Recipe names must be unique.

The UI should handle duplicate-name errors returned by the server and communicate them clearly to the user.

Recipe creation is available through the scheduling modal.

### Recipe editing

Users can edit existing recipes through the recipe drawer.

Editable fields:

- Name.
- Notes.
- URL.
- Ingredients.

Requirements:

- Name remains required and unique.
- Allow ingredients to be added, edited, and removed.
- Allow quantities to be left empty.
- Save changes through the server API.
- Display appropriate validation and error messages.

### Recipe identity and propagation

A recipe represents a single shared record.

Editing a recipe must update that recipe everywhere it appears throughout the application.

For example, changing a recipe's name must update its displayed name across every scheduled occurrence.

Changing ingredients, notes, or URL must also update the details associated with that recipe.

Do not create separate recipe copies for individual calendar dates or schedule ranges.

Schedule records remain independent of recipe content.

### Recipe deletion

Users can delete recipes through the recipe drawer.

Requirements:

- Require confirmation before deletion.
- Explain that deleting a recipe also deletes all associated schedules.
- After confirmation, delete the recipe and its associated schedules.
- Remove the recipe from the recipe list and calendar.
- Update application state after successful deletion.
- Handle deletion errors without incorrectly removing the recipe from the UI.

## 7. Data Retrieval and API Integration

The UI must communicate exclusively with the server API.

Do not access the database directly.

Centralize HTTP communication within the services layer.

### Initial application load

When the application opens:

1. Establish or validate the authenticated session.
2. Retrieve all saved recipes.
3. Retrieve calendar data for the currently displayed month.
4. Populate the recipe drawer and calendar.

The recipe list and calendar data are separate data sources.

### Recipe retrieval

Use the regular recipe retrieval endpoint:

`GET /api/recipes`

This returns all saved recipes and their associated ingredients.

It does not need to return schedule dates.

### Calendar retrieval

Use the calendar-specific canonical endpoint:

`GET /api/calendar?month=11&year=2026`

Both `month` and `year` query parameters are required and must correspond to the currently displayed calendar month.

Expected response shape:

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

Requirements:

- Request calendar data whenever the displayed month changes.
- Display the returned recipes and their schedule ranges.
- Preserve original schedule start and end dates (ISO `YYYY-MM-DD`).
- Include all schedule records overlapping the requested month.
- Return/display each recipe only once, even if multiple schedules overlap the requested month.
- Support schedules that extend beyond the displayed month.

### Data synchronization

When recipe data changes:

- Update the recipe list.
- Update any open recipe detail view.
- Update recipe names displayed on the calendar.
- Keep associated schedules intact unless explicitly modified or deleted.

When schedule data changes:

- Refresh or update the affected calendar data.
- Do not unnecessarily reload unrelated recipe information.

Use optimistic updates only when appropriate. Otherwise, update the UI after successful server responses.

## 8. State Management

Use Zustand for application-wide client state.

Suggested state domains:

### Authentication state

- Current authenticated session.
- Authenticated user.
- Session loading status.

### Recipe state

- Saved recipes.
- Selected recipe.
- Recipe loading status.
- Recipe mutation status.

### Calendar state

- Currently displayed month and year.
- Calendar schedule data.
- Calendar loading status.
- Selected calendar date.

### UI state

- Recipe drawer visibility.
- Scheduling modal visibility.
- Scheduling workflow mode (existing recipe or new recipe).
- Recipe detail visibility.
- Confirmation dialog state.

Use local React state for temporary form inputs and component-specific interactions.

Avoid duplicating server data unnecessarily.

## 9. Authentication

Use Supabase Auth for session management.

Requirements:

- Support magic-link authentication only.
- Initiate authentication by submitting the user's email to the server via `POST /api/auth/magic-link` with `{ "email": "user@example.com" }` (the server enforces the allowlist and requests the Supabase magic link using the configured frontend authentication callback URL).
- Handle the Supabase authentication callback and establish the authenticated session.
- Maintain the authenticated session using Supabase-supported session management.
- Include the access token in protected API requests.
- Support logout.
- Handle expired or invalid sessions.
- Redirect unauthenticated users to the authentication interface.

Client-side route protection is for user experience only. The server remains responsible for enforcing authentication and authorization.

Never expose database credentials, service role keys, or server-only environment variables to the frontend.

Only frontend-safe environment variables prefixed with `VITE_` may be exposed. Provide a `.env.example` documenting required frontend variables and coordinate names with other packages. Validate required variables at startup.

## 10. Component Organization

Organize the UI into reusable components.

Suggested structure:

- `src/components`
  - Calendar components.
  - Recipe components.
  - Modal components.
  - Form components.
  - Shared interface components.
- `src/pages`
- `src/layouts`
- `src/hooks`
- `src/services`
- `src/stores`
- `src/types`
- `src/utils`
- `src/assets`
- `src/styles`

The calendar should be broken into logical components rather than implemented as one large component.

Keep API communication separate from presentation components.

## 11. Error Handling and User Feedback

Provide clear feedback for:

- Failed API requests.
- Authentication errors.
- Duplicate recipe names.
- Invalid schedule dates.
- Failed recipe creation.
- Failed recipe updates.
- Failed schedule creation.
- Failed recipe deletion.

Use loading indicators where appropriate.

Prevent accidental duplicate submissions.

Do not silently discard unsaved changes.

## 12. Development Requirements

- Use TypeScript throughout.
- Follow React and Vite conventions.
- Keep components reusable and focused.
- Use Tailwind CSS for styling.
- Avoid unnecessary dependencies.
- Maintain responsive layouts.
- Keep API contracts coordinated with the orchestrator.
- Do not modify other packages.

Formal testing requirements are deferred for now.

The agent should still verify that the application builds and TypeScript checks successfully.

## 13. Completion Report

When finished, provide the orchestrator with:

1. Summary of implementation.
2. Files created or modified.
3. Dependencies installed or removed.
4. API endpoints consumed.
5. Expected request and response contracts.
6. Environment variables required.
7. Zustand stores and state organization.
8. Authentication implementation.
9. Calendar and scheduling functionality.
10. Build and typecheck results.
11. Outstanding issues or dependencies on other packages.

Do not modify another package to resolve an integration issue. Report the issue to the orchestrator and coordinate the required change.