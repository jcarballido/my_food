import { useEffect, useState } from "react";
import { useRecipeStore } from "../../stores/recipeStore.js";
import { useCalendarStore } from "../../stores/calendarStore.js";
import { useUiStore } from "../../stores/uiStore.js";
import { Spinner, ErrorBanner } from "../ui/Feedback.js";
import type { Recipe } from "../../types/api.js";
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
      className="flex w-full shrink-0 flex-col border-l border-slate-200 bg-slate-50 lg:w-96"
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
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recipes
            </h2>
            <span className="text-xs text-slate-400">{recipes.length} saved</span>
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
              <p className="text-sm text-slate-500">
                No recipes yet. Click any calendar date to create one.
              </p>
            </div>
          ) : null}

          <ul className="min-h-0 flex-1 divide-y divide-slate-200 overflow-y-auto">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <button
                  type="button"
                  onClick={() => select(recipe.id)}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-white"
                >
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {recipe.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {recipe.ingredients.length > 0
                      ? `${recipe.ingredients.length} ingredient${recipe.ingredients.length === 1 ? "" : "s"}`
                      : "No ingredients"}
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
  const openConfirmDialog = useUiStore((state) => state.openConfirmDialog);
  const closeConfirmDialog = useUiStore((state) => state.closeConfirmDialog);
  const navigate = useUiStore((state) => state.navigate);
  const setRecipeDirty = useUiStore((state) => state.setRecipeDirty);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(recipe.name);
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [url, setUrl] = useState(recipe.url ?? "");
  const [ingredients, setIngredients] = useState(
    recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity ?? "",
    })),
  );

  const busy = mutatingRecipeId === recipe.id;

  const resetForm = () => {
    setName(recipe.name);
    setNotes(recipe.notes ?? "");
    setUrl(recipe.url ?? "");
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button type="button" onClick={handleBack} disabled={busy} className="btn-ghost px-2 py-1">
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
                className="btn-ghost text-red-600 hover:bg-red-50"
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
            ingredients={ingredients}
            onNameChange={setName}
            onNotesChange={setNotes}
            onUrlChange={setUrl}
            onIngredientsChange={setIngredients}
          />
        ) : (
          <RecipeSummary recipe={recipe} />
        )}
      </div>
    </div>
  );
}

interface RecipeSummaryProps {
  recipe: Recipe;
}

/** Read-only view of a recipe. */
function RecipeSummary({ recipe }: RecipeSummaryProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{recipe.name}</h3>
        {recipe.notes ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {recipe.notes}
          </p>
        ) : null}
        {recipe.url ? (
          <a
            href={recipe.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block break-all text-sm text-sky-700 underline hover:text-sky-900"
          >
            {recipe.url}
          </a>
        ) : null}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ingredients
        </h4>
        {recipe.ingredients.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No ingredients listed.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-700">{ingredient.name}</span>
                {ingredient.quantity ? (
                  <span className="shrink-0 text-slate-500">{ingredient.quantity}</span>
                ) : null}
              </li>
            ))}
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
  ingredients: IngredientDraft[];
  onNameChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onIngredientsChange: (value: IngredientDraft[]) => void;
}

/** Editable recipe fields, including the ingredient list. */
function RecipeForm({
  name,
  notes,
  url,
  ingredients,
  onNameChange,
  onNotesChange,
  onUrlChange,
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
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => onIngredientsChange([...ingredients, { name: "", quantity: "" }])}
          >
            Add ingredient
          </button>
        </div>

        {ingredients.length === 0 ? (
          <p className="text-sm text-slate-500">No ingredients yet.</p>
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
                  className="btn-ghost px-2 text-slate-500 hover:text-red-600"
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
