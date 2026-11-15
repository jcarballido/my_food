import { useMemo } from "react";
import { buildCalendarLayout } from "../../utils/calendarLayout.js";
import { isInMonth, toIsoDate } from "../../utils/date.js";
import type { CalendarRecipe } from "../../types/api.js";
import { ScheduleBar } from "./ScheduleBar.js";
import { getWeekRowHeight } from "./layout.js";

interface CalendarGridProps {
  recipes: CalendarRecipe[];
  month: number;
  year: number;
  onSelectDate: (date: string) => void;
  onSelectRecipe: (recipeId: string) => void;
}

/**
 * The month grid.
 *
 * Dates are rendered as a plain grid; schedule bars are overlaid per week row
 * so a recipe scheduled across several days appears as one continuous bar.
 */
export function CalendarGrid({
  recipes,
  month,
  year,
  onSelectDate,
  onSelectRecipe,
}: CalendarGridProps) {
  const layout = useMemo(
    () => buildCalendarLayout(recipes, year, month),
    [recipes, year, month],
  );

  const now = new Date();
  const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex min-h-full flex-col">
        {layout.weeks.map((week, weekIndex) => {
          const segments = layout.segmentsByWeek[weekIndex] ?? [];

          return (
            <div
              key={weekIndex}
              style={{ minHeight: `${getWeekRowHeight(Math.max(0, ...segments.map((segment) => segment.lane + 1)))}px` }}
              className="relative grid flex-1 grid-cols-7 border-b border-line/70 last:border-b-0"
            >
              {/* Day cells */}
              {week.map((date, columnIndex) => {
                const inMonth = isInMonth(date, year, month);
                const isToday = date === today;
                const isWeekend = columnIndex === 0 || columnIndex === 6;
                const surface = !inMonth
                  ? "bg-cream-deep/35"
                  : isWeekend
                    ? "bg-[#fcf8ef]"
                    : "bg-paper";

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onSelectDate(date)}
                    className={`min-h-[104px] border-r border-line/70 p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-sage-soft/55 ${surface}`}
                    aria-label={`Schedule a recipe on ${date}`}
                  >
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ${
                        isToday
                          ? "bg-sage-dark text-white shadow-sm"
                          : inMonth
                            ? "text-ink-soft"
                            : "text-muted/70"
                      }`}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                  </button>
                );
              })}

              {/* Schedule bars */}
              <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0">
                {segments.map((segment) => (
                  <ScheduleBar
                    key={segment.key}
                    segment={segment}
                    onSelectRecipe={onSelectRecipe}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
