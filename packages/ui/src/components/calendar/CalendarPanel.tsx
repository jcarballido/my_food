import { useCallback, useEffect } from "react";
import { CalendarGrid } from "./CalendarGrid.js";
import { CalendarHeader, WeekdayRow } from "./CalendarHeader.js";
import { useCalendarStore } from "../../stores/calendarStore.js";
import { useRecipeStore } from "../../stores/recipeStore.js";
import { useUiStore } from "../../stores/uiStore.js";
import { shiftMonth } from "../../utils/date.js";

/**
 * The calendar panel.
 *
 * Loading calendar data is driven by the displayed month, so navigating
 * between months always refreshes the schedule data.
 */
export function CalendarPanel() {
  const month = useCalendarStore((state) => state.month);
  const year = useCalendarStore((state) => state.year);
  const recipes = useCalendarStore((state) => state.recipes);
  const status = useCalendarStore((state) => state.status);
  const error = useCalendarStore((state) => state.error);
  const load = useCalendarStore((state) => state.load);

  const selectRecipe = useRecipeStore((state) => state.select);
  const removeSchedule = useCalendarStore((state) => state.removeSchedule);
  const clearCalendarError = useCalendarStore((state) => state.clearError);
  const openScheduleModal = useUiStore((state) => state.openScheduleModal);
  const openConfirmDialog = useUiStore((state) => state.openConfirmDialog);
  const closeConfirmDialog = useUiStore((state) => state.closeConfirmDialog);
  const setDrawerOpen = useUiStore((state) => state.setDrawerOpen);
  const setMonth = useCalendarStore((state) => state.setMonth);
  const navigate = useUiStore((state) => state.navigate);

  // The displayed month drives the load, so navigating only has to change the
  // month — the effect below fetches the data exactly once.
  useEffect(() => {
    void load(month, year);
  }, [load, month, year]);

  const goToMonth = useCallback(
    (offset: number) => {
      const target = shiftMonth(month, year, offset);
      setMonth(target.month, target.year);
    },
    [month, year, setMonth],
  );

  const goToToday = useCallback(() => {
    const now = new Date();
    setMonth(now.getMonth() + 1, now.getFullYear());
  }, [setMonth]);

  const handleSelectDate = useCallback(
    (date: string) => {
      openScheduleModal({ mode: "existing", date });
    },
    [openScheduleModal],
  );

  const handleSelectRecipe = useCallback(
    (recipeId: string) => {
      navigate(() => {
        selectRecipe(recipeId);
        setDrawerOpen(true);
      });
    },
    [selectRecipe, setDrawerOpen, navigate],
  );

  /**
   * Removing a scheduled meal only deletes the schedule record. The recipe
   * stays in the drawer and can be scheduled again later.
   */
  const handleDeleteSchedule = useCallback(
    (recipeId: string, scheduleId: string, recipeName: string) => {
      clearCalendarError();
      openConfirmDialog({
        title: "Remove scheduled meal?",
        message: `Remove "${recipeName}" from the calendar? Only these scheduled dates are deleted — the recipe itself stays in your collection.`,
        confirmLabel: "Remove from calendar",
        destructive: true,
        onConfirm: async () => {
          const removed = await removeSchedule(recipeId, scheduleId);
          if (removed) closeConfirmDialog();
        },
      });
    },
    [openConfirmDialog, closeConfirmDialog, removeSchedule, clearCalendarError],
  );

  return (
    <section
      className="panel flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Calendar"
    >
      <CalendarHeader
        month={month}
        year={year}
        busy={status === "loading"}
        onPrevious={() => goToMonth(-1)}
        onNext={() => goToMonth(1)}
        onToday={goToToday}
      />

      <WeekdayRow />

      {error ? (
        <div
          role="alert"
          className="m-4 rounded-2xl border border-clay/30 bg-clay-soft px-4 py-3 text-sm text-clay-ink"
        >
          {error}
        </div>
      ) : null}

      <CalendarGrid
        recipes={recipes}
        month={month}
        year={year}
        onSelectDate={handleSelectDate}
        onSelectRecipe={handleSelectRecipe}
        onDeleteSchedule={handleDeleteSchedule}
      />
    </section>
  );
}
