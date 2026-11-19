import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal.js";
import { ErrorBanner } from "../ui/Feedback.js";
import { useUiStore } from "../../stores/uiStore.js";
import { useRecipeStore } from "../../stores/recipeStore.js";
import { useCalendarStore } from "../../stores/calendarStore.js";
import { recipeService } from "../../services/index.js";
import { ApiError } from "../../services/api.js";
import { addDays, daysBetween, daysInclusive, isValidIsoDate, toIsoDate } from "../../utils/date.js";
import { handleSessionError } from "../../stores/authStore.js";
import { useBeforeUnload } from "../../hooks/useBeforeUnload.js";
import type { ScheduleCook } from "../../types/api.js";

type DateMode = "range" | "duration";

interface IngredientDraft {
  name: string;
  quantity: string;
}

/**
 * The scheduling modal.
 *
 * It is the only entry point for creating schedules and supports both
 * workflows: scheduling an existing recipe, and creating a new recipe that is
 * scheduled immediately.
 */
export function ScheduleModal() {
  const open = useUiStore((state) => state.scheduleModalOpen);
  const mode = useUiStore((state) => state.scheduleModalMode);
  const preselectedDate = useUiStore((state) => state.scheduleModalDate);
  const preselectedRecipeId = useUiStore((state) => state.scheduleModalRecipeId);
  const editingSchedule = useUiStore((state) => state.scheduleModalSchedule);
  const closeModal = useUiStore((state) => state.closeScheduleModal);
  const isEditing = editingSchedule !== null;
  const openConfirmDialog = useUiStore((state) => state.openConfirmDialog);
  const closeConfirmDialog = useUiStore((state) => state.closeConfirmDialog);

  const recipes = useRecipeStore((state) => state.recipes);
  const addRecipe = useRecipeStore((state) => state.load);
  const refreshCalendar = useCalendarStore((state) => state.load);
  const removeSchedule = useCalendarStore((state) => state.removeSchedule);
  const clearCalendarError = useCalendarStore((state) => state.clearError);

  const [workflow, setWorkflow] = useState<"existing" | "new">(mode);
  const [recipeId, setRecipeId] = useState<string>("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [duration, setDuration] = useState("1");
  const [dateMode, setDateMode] = useState<DateMode>("duration");
  const [cook, setCook] = useState<ScheduleCook | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialStart, setInitialStart] = useState("");
  const [initialEnd, setInitialEnd] = useState("");

  // Reset the form whenever the modal is opened.
  useEffect(() => {
    if (!open) return;

    const today = toIsoDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const nextStart = editingSchedule?.start_date ?? preselectedDate ?? today;
    const nextEnd = editingSchedule?.end_date ?? nextStart;
    setInitialStart(nextStart);
    setInitialEnd(nextEnd);

    setWorkflow(mode);
    setRecipeId(editingSchedule?.recipe_id ?? preselectedRecipeId ?? "");
    setName("");
    setNotes("");
    setUrl("");
    setIngredients([]);
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDuration(
      editingSchedule ? String(daysInclusive(nextStart, nextEnd)) : "1",
    );
    // Editing always starts from the exact saved range.
    setDateMode(editingSchedule ? "range" : "duration");
    setCook(editingSchedule?.cook ?? "");
    setError(null);
    setSubmitting(false);
  }, [open, mode, preselectedDate, preselectedRecipeId, editingSchedule]);

  const dirty = open && Boolean(name || notes || url || ingredients.length ||
    recipeId !== (editingSchedule?.recipe_id ?? preselectedRecipeId ?? "") ||
    cook !== (editingSchedule?.cook ?? "") ||
    startDate !== initialStart || endDate !== initialEnd);
  useBeforeUnload(dirty || submitting);
  const requestClose = () => {
    if (submitting) return;
    if (!dirty) {
      closeModal();
      return;
    }
    openConfirmDialog({
      title: isEditing ? "Discard schedule changes?" : "Discard unsaved schedule?",
      message: isEditing
        ? "Your changes to this schedule have not been saved."
        : "Your recipe and schedule have not been saved.",
      confirmLabel: "Discard changes",
      onConfirm: () => {
        closeConfirmDialog();
        closeModal();
      },
    });
  };

  // Keep the end date in sync with whichever date method is active.
  useEffect(() => {
    if (!isValidIsoDate(startDate)) return;

    if (dateMode === "duration") {
      const days = Number(duration);
      if (Number.isInteger(days) && days >= 1) {
        setEndDate(addDays(startDate, days - 1));
      }
    }
  }, [dateMode, duration, startDate]);

  /**
   * Changing the start date recalculates the dependent end date, keeping the
   * currently selected duration intact in both date methods.
   */
  const handleStartDateChange = (value: string) => {
    if (!startDate || !value) {
      setStartDate(value);
      return;
    }

    const shift = daysBetween(startDate, value);
    setStartDate(value);

    if (dateMode === "range") {
      setEndDate((current) => (current ? addDays(current, shift) : current));
    }
  };

  /**
   * Switching between the two date methods preserves the selected range:
   * the duration is derived from the current range, and the end date is
   * derived from the current duration.
   */
  const handleDateModeChange = (mode: DateMode) => {
    if (mode === dateMode) return;

    if (mode === "duration") {
      if (startDate && endDate && endDate >= startDate) {
        setDuration(String(daysInclusive(startDate, endDate)));
      }
    } else if (startDate) {
      const days = Number(duration);
      if (Number.isInteger(days) && days >= 1) {
        setEndDate(addDays(startDate, days - 1));
      }
    }

    setDateMode(mode);
  };

  const calculatedDuration = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const days = daysInclusive(startDate, endDate);
    return days > 0 ? days : 0;
  }, [startDate, endDate]);

  const validationError = useMemo(() => {
    if (!isValidIsoDate(startDate)) return "A valid start date is required.";
    if (endDate < startDate) return "The end date cannot precede the start date.";
    if (dateMode === "duration") {
      const days = Number(duration);
      if (!Number.isInteger(days) || days < 1) {
        return "Duration must be a positive whole number of days.";
      }
    }
    if (!isValidIsoDate(endDate)) return "A valid end date between years 0001 and 9999 is required.";
    if (workflow === "existing" && !recipeId) return "Select a recipe to schedule.";
    if (workflow === "new" && name.trim().length === 0) return "A recipe name is required.";
    return null;
  }, [dateMode, duration, endDate, name, recipeId, startDate, workflow]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (editingSchedule) {
        await recipeService.updateSchedule(editingSchedule.recipe_id, editingSchedule.id, {
          start_date: startDate,
          end_date: endDate,
          cook: cook === "" ? null : cook,
        });
      } else if (workflow === "existing") {
        await recipeService.createSchedule(recipeId, {
          start_date: startDate,
          end_date: endDate,
          cook: cook === "" ? null : cook,
        });
      } else {
        // New recipe plus its first schedule is a single atomic operation.
        await recipeService.createWithSchedule({
          recipe: {
            name: name.trim(),
            notes: notes.trim().length > 0 ? notes.trim() : null,
            url: url.trim().length > 0 ? url.trim() : null,
          },
          ingredients: ingredients
            .filter((ingredient) => ingredient.name.trim().length > 0)
            .map((ingredient) => ({
              name: ingredient.name.trim(),
              quantity: ingredient.quantity.trim().length > 0 ? ingredient.quantity.trim() : null,
            })),
          schedule: {
            start_date: startDate,
            end_date: endDate,
            cook: cook === "" ? null : cook,
          },
        });

        // The recipe list must include the newly created recipe.
        await addRecipe();
      }

      await refreshCalendar();
      closeModal();
    } catch (caught) {
      handleSessionError(caught);
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to save the schedule. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const editingRecipeName =
    recipes.find((recipe) => recipe.id === editingSchedule?.recipe_id)?.name ??
    "this meal";

  /**
   * Deletes only the schedule being edited. The recipe and its other
   * schedules are left untouched.
   */
  const handleDeleteSchedule = () => {
    if (!editingSchedule || submitting) return;
    const { id, recipe_id } = editingSchedule;

    clearCalendarError();
    openConfirmDialog({
      title: "Remove scheduled meal?",
      message: `Remove "${editingRecipeName}" from the calendar? Only these scheduled dates are deleted — the recipe itself stays in your collection.`,
      confirmLabel: "Remove from calendar",
      destructive: true,
      onConfirm: async () => {
        const removed = await removeSchedule(recipe_id, id);
        if (removed) {
          closeConfirmDialog();
          closeModal();
        }
      },
    });
  };

  return (
    <Modal
      open={open}
      title={
        isEditing
          ? "Edit schedule"
          : workflow === "existing"
            ? "Schedule a recipe"
            : "New recipe & schedule"
      }
      onClose={requestClose}
      busy={submitting}
      footer={
        <>
          {isEditing ? (
            <button
              type="button"
              className="btn-ghost mr-auto text-clay hover:bg-clay-soft"
              onClick={handleDeleteSchedule}
              disabled={submitting}
            >
              Delete schedule
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={requestClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSubmit()}
            disabled={submitting || validationError !== null}
          >
            {submitting ? "Saving…" : isEditing ? "Save changes" : "Save schedule"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <ErrorBanner message={error} /> : null}

        {/* Workflow switch (editing only changes the dates of a known recipe) */}
        {isEditing ? null : (
          <div
            className="grid grid-cols-2 gap-1.5 rounded-full border border-line bg-cream-deep p-1"
            role="tablist"
            aria-label="Scheduling workflow"
          >
            {(["existing", "new"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={workflow === option}
                onClick={() => setWorkflow(option)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  workflow === option
                    ? "bg-paper text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option === "existing" ? "Existing recipe" : "New recipe"}
              </button>
            ))}
          </div>
        )}

        {workflow === "existing" ? (
          <div>
            {isEditing ? (
              <>
                <span className="label">Recipe</span>
                <p className="rounded-xl border border-line bg-cream-deep/60 px-3.5 py-2.5 text-sm font-medium text-ink">
                  {recipes.find((recipe) => recipe.id === recipeId)?.name ?? "Recipe"}
                </p>
              </>
            ) : (
              <>
                <label className="label" htmlFor="schedule-recipe">
                  Recipe
                </label>
                <select
                  id="schedule-recipe"
                  className="input"
                  value={recipeId}
                  onChange={(event) => setRecipeId(event.target.value)}
                >
                  <option value="">Select a recipe…</option>
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="new-recipe-name">
                Name
              </label>
              <input
                id="new-recipe-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Pancakes"
              />
            </div>

            <div>
              <label className="label" htmlFor="new-recipe-notes">
                Notes
              </label>
              <textarea
                id="new-recipe-notes"
                className="input min-h-16 resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes"
              />
            </div>

            <div>
              <label className="label" htmlFor="new-recipe-url">
                URL
              </label>
              <input
                id="new-recipe-url"
                className="input"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/recipe"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="label mb-0">Ingredients</span>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-xs"
                  onClick={() => setIngredients([...ingredients, { name: "", quantity: "" }])}
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
                        onChange={(event) =>
                          setIngredients(
                            ingredients.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, name: event.target.value }
                                : current,
                            ),
                          )
                        }
                        placeholder="Ingredient"
                        aria-label={`Ingredient ${index + 1} name`}
                      />
                      <input
                        className="input flex-1"
                        value={ingredient.quantity}
                        onChange={(event) =>
                          setIngredients(
                            ingredients.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, quantity: event.target.value }
                                : current,
                            ),
                          )
                        }
                        placeholder="Quantity"
                        aria-label={`Ingredient ${index + 1} quantity`}
                      />
                      <button
                        type="button"
                        className="btn-ghost px-2 text-muted hover:bg-clay-soft hover:text-clay"
                        onClick={() =>
                          setIngredients(ingredients.filter((_, current) => current !== index))
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
        )}

        {/* Date selection */}
        <div className="space-y-3 border-t border-line/80 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Schedule
            </span>
            <div
              className="flex rounded-full border border-line-strong bg-cream-deep/70 p-0.5"
              role="group"
              aria-label="Date input method"
            >
              {(["duration", "range"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleDateModeChange(option)}
                  aria-pressed={dateMode === option}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    dateMode === option
                      ? "bg-sage-dark text-white shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {option === "duration" ? "By duration" : "By end date"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="schedule-start">
                Start date
              </label>
              <input
                id="schedule-start"
                type="date"
                className="input"
                value={startDate}
                onChange={(event) => handleStartDateChange(event.target.value)}
              />
            </div>

            {dateMode === "duration" ? (
              <div>
                <label className="label" htmlFor="schedule-duration">
                  Duration (days)
                </label>
                <input
                  id="schedule-duration"
                  type="number"
                  min={1}
                  step={1}
                  className="input"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="label" htmlFor="schedule-end">
                  End date
                </label>
                <input
                  id="schedule-end"
                  type="date"
                  className="input"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            )}
          </div>

          <div className="max-w-[12rem]">
            <label className="label" htmlFor="schedule-cook">
              Cook <span className="text-muted">(optional)</span>
            </label>
            <select
              id="schedule-cook"
              className="input"
              value={cook}
              onChange={(event) => setCook(event.target.value as ScheduleCook | "")}
            >
              <option value="">Not set</option>
              <option value="J">J</option>
              <option value="H">H</option>
            </select>
          </div>

          {calculatedDuration > 0 ? (
            <p className="text-sm text-muted">
              {calculatedDuration} day{calculatedDuration === 1 ? "" : "s"} · {startDate} →{" "}
              {endDate}
            </p>
          ) : null}

          {validationError ? (
            <p className="field-error" role="alert">
              {validationError}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
