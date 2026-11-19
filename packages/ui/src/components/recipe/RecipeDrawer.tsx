import { useEffect, useState } from "react";
import { useRecipeStore } from "../../stores/recipeStore.js";
import { useCalendarStore } from "../../stores/calendarStore.js";
import { useUiStore } from "../../stores/uiStore.js";
import { Spinner, ErrorBanner } from "../ui/Feedback.js";
import { RecipeIcon, RECIPE_ICON_OPTIONS } from "./RecipeIcon.js";
import type { Recipe, RecipeIconName, Schedule } from "../../types/api.js";
import { daysInclusive, formatDate } from "../../utils/date.js";
import { useBeforeUnload } from "../../hooks/useBeforeUnload.js";

interface RecipeDrawerProps {
  open: boolean;
}

/**
 * The collapsible recipe drawer.
 *
 * Shows the full recipe list; selecting a recipe reveals its details and
 * editing controls in a second section of the same drawer.
 */
export function RecipeDrawer({ open }: RecipeDrawerProps) {
  const recipes = useRecipeStore((state) => state.recipes);
  const status = useRecipeStore((state) => state.status);
  const error = useRecipeStore((state) => state.error);
  const selectedRecipeId = useRecipeStore((state) => state.selectedRecipeId);
  const select = useRecipeStore((state) => state.select);
  const clearError = useRecipeStore((state) => state.clearError);

  const [showDetail, setShowDetail] = useState(false);

  // Selecting a recipe from the calendar reveals the details section.
  useEffect(() => {
    if (selectedRecipeId) setShowDetail(true);
  }, [selectedRecipeId]);

  const selected = recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null;

  return (
    <aside
      hidden={!open}
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-[28px] border border-line bg-cream-deep/70 shadow-[0_28px_60px_-45px_rgba(0,0,0,0.45)] lg:w-96"
      aria-label="Recipes"
    >
      {showDetail && selected ? (
        <RecipeDetail
          key={selected.id}
          recipe={selected}
          onBack={() => {
            setShowDetail(false);
            select(null);
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line/80 px-4 py-4">
            <div>
              <div className="eyebrow">Your collection</div>
              <h2 className="mt-0.5 text-xl font-medium text-ink">Recipes</h2>
            </div>
            <span className="rounded-full bg-sage-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sage-ink">
              {recipes.length} saved
            </span>
          </div>

          {error ? (
            <div className="px-4 pt-3">
              <ErrorBanner message={error} onDismiss={clearError} />
            </div>
          ) : null}

          {status === "loading" && recipes.length === 0 ? (
            <div className="p-4">
              <Spinner label="Loading recipes" />
            </div>
          ) : null}

          {status === "ready" && recipes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm leading-relaxed text-muted">
                No recipes yet. Click any calendar date to create one.
              </p>
            </div>
          ) : null}

          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <button
                  type="button"
                  onClick={() => select(recipe.id)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2.5 text-left transition-colors hover:border-line hover:bg-paper"
                >
                  <span className="recipe-icon h-11 w-11">
                    <RecipeIcon name={recipe.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {recipe.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {recipe.ingredients.length > 0
                        ? `${recipe.ingredients.length} ingredient${recipe.ingredients.length === 1 ? "" : "s"}`
                        : "No ingredients"}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="pr-1 text-lg text-muted/60 transition-transform group-hover:translate-x-0.5"
                  >
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

interface RecipeDetailProps {
  recipe: Recipe;
  onBack: () => void;
}

/** Detail and editing view for a single recipe. */
function RecipeDetail({ recipe, onBack }: RecipeDetailProps) {
  const update = useRecipeStore((state) => state.update);
  const remove = useRecipeStore((state) => state.remove);
  const mutatingRecipeId = useRecipeStore((state) => state.mutatingRecipeId);
  const error = useRecipeStore((state) => state.error);
  const clearError = useRecipeStore((state) => state.clearError);
  const patchCalendarRecipe = useCalendarStore((state) => state.patchRecipe);
  const removeFromCalendar = useCalendarStore((state) => state.removeRecipe);
  const removeScheduleFromCalendar = useCalendarStore((state) => state.removeSchedule);
  const clearCalendarError = useCalendarStore((state) => state.clearError);
  const calendarRecipes = useCalendarStore((state) => state.recipes);
  const openConfirmDialog = useUiStore((state) => state.openConfirmDialog);
  const closeConfirmDialog = useUiStore((state) => state.closeConfirmDialog);
  const openScheduleModal = useUiStore((state) => state.openScheduleModal);
  const navigate = useUiStore((state) => state.navigate);
  const setRecipeDirty = useUiStore((state) => state.setRecipeDirty);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(recipe.name);
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [url, setUrl] = useState(recipe.url ?? "");
  const [icon, setIcon] = useState<RecipeIconName>(recipe.icon ?? "utensils");
  const [ingredients, setIngredients] = useState(
    recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity ?? "",
    })),
  );

  const busy = mutatingRecipeId === recipe.id;

  // The calendar payload carries the schedules that overlap the displayed
  // month, which is exactly the set the user can currently see and edit.
  const schedules = [...(calendarRecipes.find((item) => item.id === recipe.id)?.schedules ?? [])]
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const resetForm = () => {
    setName(recipe.name);
    setNotes(recipe.notes ?? "");
    setUrl(recipe.url ?? "");
    setIcon(recipe.icon ?? "utensils");
    setIngredients(
      recipe.ingredients.map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.quantity ?? "",
      })),
    );
  };

  // Unsaved edits are detected by comparing the form against the stored
  // recipe, so leaving the detail view cannot discard them silently.
  const isDirty = editing && (
    name !== recipe.name ||
    notes !== (recipe.notes ?? "") ||
    url !== (recipe.url ?? "") ||
    icon !== (recipe.icon ?? "utensils") ||
    ingredients.length !== recipe.ingredients.length ||
    ingredients.some((ingredient, index) => {
      const stored = recipe.ingredients[index];
      if (!stored) return true;
      return (
        ingredient.name !== stored.name ||
        ingredient.quantity !== (stored.quantity ?? "")
      );
    }));

  useBeforeUnload(isDirty);
  useEffect(() => {
    setRecipeDirty(isDirty);
    return () => setRecipeDirty(false);
  }, [isDirty, setRecipeDirty]);

  const handleBack = () => navigate(onBack);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      clearError();
      return;
    }

    const saved = await update(recipe.id, {
      name: trimmedName,
      notes: notes.trim().length > 0 ? notes.trim() : null,
      url: url.trim().length > 0 ? url.trim() : null,
      icon,
      ingredients: ingredients
        .filter((ingredient) => ingredient.name.trim().length > 0)
        .map((ingredient) => ({
          name: ingredient.name.trim(),
          quantity: ingredient.quantity.trim().length > 0 ? ingredient.quantity.trim() : null,
        })),
    });

    if (saved) {
      // Keep the calendar in sync so the recipe is consistent everywhere.
      patchCalendarRecipe(recipe.id, {
        name: saved.name,
        notes: saved.notes,
        url: saved.url,
        icon: saved.icon,
        ingredients: saved.ingredients,
      });
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    const removed = await remove(recipe.id);
    if (removed) {
      removeFromCalendar(recipe.id);
      closeConfirmDialog();
      onBack();
    }
  };

  const handleDeleteSchedule = (schedule: Schedule) => {
    clearCalendarError();
    openConfirmDialog({
      title: "Remove scheduled meal?",
      message: `Remove "${recipe.name}" from the calendar? Only these scheduled dates are deleted — the recipe itself stays in your collection.`,
      confirmLabel: "Remove from calendar",
      destructive: true,
      onConfirm: async () => {
        const removed = await removeScheduleFromCalendar(recipe.id, schedule.id);
        if (removed) closeConfirmDialog();
      },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line/80 px-3 py-3">
        <button type="button" onClick={handleBack} disabled={busy} className="btn-ghost h-9 w-9 px-0">
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">Back to recipe list</span>
        </button>

        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  resetForm();
                  setEditing(false);
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={busy || !name.trim()}>
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  resetForm();
                  clearError();
                  setEditing(true);
                }}
                disabled={busy}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-ghost text-clay hover:bg-clay-soft"
                onClick={() =>
                  openConfirmDialog({
                    title: "Delete recipe?",
                    message:
                      `Deleting "${recipe.name}" also deletes all of its schedules. This cannot be undone.`,
                    confirmLabel: "Delete recipe",
                    destructive: true,
                    onConfirm: handleDelete,
                  })
                }
                disabled={busy}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {editing ? (
          <RecipeForm
            name={name}
            notes={notes}
            url={url}
            icon={icon}
            ingredients={ingredients}
            onNameChange={setName}
            onNotesChange={setNotes}
            onUrlChange={setUrl}
            onIconChange={setIcon}
            onIngredientsChange={setIngredients}
          />
        ) : (
          <RecipeSummary
            recipe={recipe}
            schedules={schedules}
            onEditSchedule={(schedule) =>
              openScheduleModal({ recipeId: recipe.id, schedule })
            }
            onDeleteSchedule={handleDeleteSchedule}
          />
        )}
      </div>
    </div>
  );
}

interface RecipeSummaryProps {
  recipe: Recipe;
  schedules: Schedule[];
  onEditSchedule: (schedule: Schedule) => void;
  onDeleteSchedule: (schedule: Schedule) => void;
}

/** Read-only view of a recipe. */
function RecipeSummary({
  recipe,
  schedules,
  onEditSchedule,
  onDeleteSchedule,
}: RecipeSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="recipe-icon h-14 w-14">
          <RecipeIcon name={recipe.icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl font-medium text-ink">{recipe.name}</h3>
          {recipe.notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
              {recipe.notes}
            </p>
          ) : null}
          {recipe.url ? (
            <a
              href={recipe.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block break-all text-sm text-sage-ink underline decoration-sage-ink/40 underline-offset-2 hover:text-ink"
            >
              {recipe.url}
            </a>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="eyebrow">Ingredients</h4>
        {recipe.ingredients.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No ingredients listed.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/70">
            {recipe.ingredients.map((ingredient) => (
              <li
                key={ingredient.id}
                className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
              >
                <span className="text-ink-soft">{ingredient.name}</span>
                {ingredient.quantity ? (
                  <span className="shrink-0 text-muted">{ingredient.quantity}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="eyebrow">Scheduled this month</h4>
          <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-semibold text-sage-ink">
            {schedules.length}
          </span>
        </div>
        {schedules.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No schedules in the displayed month.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {schedules.map((schedule) => {
              const duration = daysInclusive(schedule.start_date, schedule.end_date);
              return (
                <li
                  key={schedule.id}
                  className="rounded-2xl border border-line bg-cream/60 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                        <span className="truncate">
                          {formatDate(schedule.start_date)} → {formatDate(schedule.end_date)}
                        </span>
                        {schedule.cook ? (
                          <span
                            className="shrink-0 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[10px] font-bold text-ink-soft"
                            title={`Cook ${schedule.cook}`}
                          >
                            {schedule.cook}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {duration} day{duration === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5 text-xs"
                        onClick={() => onEditSchedule(schedule)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-2.5 py-1.5 text-xs text-clay hover:bg-clay-soft"
                        onClick={() => onDeleteSchedule(schedule)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export interface IngredientDraft {
  name: string;
  quantity: string;
}

interface RecipeFormProps {
  name: string;
  notes: string;
  url: string;
  icon: RecipeIconName;
  ingredients: IngredientDraft[];
  onNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onIconChange: (value: RecipeIconName) => void;
  onIngredientsChange: (value: IngredientDraft[]) => void;
}

/** Editable recipe fields, including the ingredient list. */
function RecipeForm({
  name,
  notes,
  url,
  icon,
  ingredients,
  onNameChange,
  onNotesChange,
  onUrlChange,
  onIconChange,
  onIngredientsChange,
}: RecipeFormProps) {
  const updateIngredient = (index: number, changes: Partial<IngredientDraft>) => {
    onIngredientsChange(
      ingredients.map((ingredient, current) =>
        current === index ? { ...ingredient, ...changes } : ingredient,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <span className="label">Icon</span>
        <div
          className="grid grid-cols-4 gap-2"
          role="radiogroup"
          aria-label="Recipe icon"
        >
          {RECIPE_ICON_OPTIONS.map((option) => {
            const active = icon === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={option.label}
                title={option.label}
                onClick={() => onIconChange(option.value)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-sage-ink bg-sage-soft text-sage-ink shadow-sm"
                    : "border-line-strong bg-paper text-muted hover:border-sage-ink/40 hover:bg-cream-deep hover:text-ink"
                }`}
              >
                <RecipeIcon name={option.value} className="h-5 w-5" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="recipe-name">
          Name
        </label>
        <input
          id="recipe-name"
          className="input"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Pancakes"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="recipe-notes">
          Notes
        </label>
        <textarea
          id="recipe-notes"
          className="input min-h-20 resize-y"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Optional notes"
        />
      </div>

      <div>
        <label className="label" htmlFor="recipe-url">
          URL
        </label>
        <input
          id="recipe-url"
          className="input"
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://example.com/recipe"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label mb-0">Ingredients</span>
          <button
            type="button"
            className="btn-secondary px-3 py-1 text-xs"
            onClick={() => onIngredientsChange([...ingredients, { name: "", quantity: "" }])}
          >
            Add ingredient
          </button>
        </div>

        {ingredients.length === 0 ? (
          <p className="text-sm text-muted">No ingredients yet.</p>
        ) : (
          <ul className="space-y-2">
            {ingredients.map((ingredient, index) => (
              <li key={index} className="flex gap-2">
                <input
                  className="input flex-1"
                  value={ingredient.name}
                  onChange={(event) => updateIngredient(index, { name: event.target.value })}
                  placeholder="Ingredient"
                  aria-label={`Ingredient ${index + 1} name`}
                />
                <input
                  className="input flex-1"
                  value={ingredient.quantity}
                  onChange={(event) => updateIngredient(index, { quantity: event.target.value })}
                  placeholder="Quantity"
                  aria-label={`Ingredient ${index + 1} quantity`}
                />
                <button
                  type="button"
                  className="btn-ghost px-2 text-muted hover:bg-clay-soft hover:text-clay"
                  onClick={() =>
                    onIngredientsChange(ingredients.filter((_, current) => current !== index))
                  }
                  aria-label={`Remove ingredient ${index + 1}`}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
