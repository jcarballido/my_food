import { useMemo } from "react";
import { buildCalendarLayout } from "../../utils/calendarLayout.js";
import { isInMonth, toIsoDate } from "../../utils/date.js";
import type { CalendarRecipe } from "../../types/api.js";
import { ScheduleBar } from "./ScheduleBar.js";
import { DAY_HEADER_HEIGHT, LANE_HEIGHT, WEEK_ROW_HEIGHT } from "./layout.js";

interface CalendarGridProps {
  recipes: CalendarRecipe[];
  month: number;
  year: number;
  onSelectDate: (date: string) => void;
  onSelectRecipe: (recipeId: string) => void;
  onDeleteSchedule: (
    recipeId: string,
    scheduleId: string,
    recipeName: string,
  ) => void;
}

/**
 * The month grid.
 *
 * Every week row is split into two fixed regions: a full-width date strip at
 * the top and a schedule area below it. The date numbers are pinned to the
 * top-left of their columns, and schedule bars are only ever laid out in the
 * area below the strip, so no meal can cover or displace a date. Rows have a
 * fixed height; a week with more meals than the band can show scrolls its own
 * schedule area instead of moving the dates.
 */
export function CalendarGrid({
  recipes,
  month,
  year,
  onSelectDate,
  onSelectRecipe,
  onDeleteSchedule,
}: CalendarGridProps) {
  const layout = useMemo(
    () => buildCalendarLayout(recipes, year, month),
    [recipes, year, month],
  );

  const now = new Date();
  const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const barAreaHeight = WEEK_ROW_HEIGHT - DAY_HEADER_HEIGHT;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-col">
        {layout.weeks.map((week, weekIndex) => {
          const segments = layout.segmentsByWeek[weekIndex] ?? [];
          const laneCount = Math.max(
            0,
            ...segments.map((segment) => segment.lane + 1),
          );
          // Bars may need more room than the fixed band offers; in that case
          // the band scrolls rather than moving the dates.
          const contentHeight = Math.max(1, laneCount) * LANE_HEIGHT + 4;
          const scrollable = contentHeight > barAreaHeight;

          return (
            <div
              key={weekIndex}
              style={{ height: `${WEEK_ROW_HEIGHT}px` }}
              className="relative grid shrink-0 grid-cols-7 border-b border-line/70 last:border-b-0"
            >
              {/* Full-cell click targets. The date strip below is painted on
                  top but ignores pointer events, so these stay clickable. */}
              {week.map((date, columnIndex) => {
                const inMonth = isInMonth(date, year, month);
                const isWeekend = columnIndex === 0 || columnIndex === 6;
                const surface = !inMonth
                  ? "bg-cream-deep/35"
                  : isWeekend
                    ? "bg-cream-deep/45"
                    : "bg-paper";

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onSelectDate(date)}
                    className={`h-full border-r border-line/70 transition-colors last:border-r-0 hover:bg-sage-soft/55 ${surface}`}
                    aria-label={`Schedule a recipe on ${date}`}
                  />
                );
              })}

              {/* Reserved date strip: the entire horizontal band belongs to
                  the dates. It is decorative for assistive tech because the
                  day buttons above already carry the date labels. */}
              <div
                aria-hidden="true"
                style={{ height: `${DAY_HEADER_HEIGHT}px` }}
                className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-7 border-b border-line/70"
              >
                {week.map((date) => {
                  const inMonth = isInMonth(date, year, month);
                  const isToday = date === today;

                  return (
                    <div
                      key={date}
                      className="flex items-start justify-start border-r border-line/70 px-1.5 pt-1.5 last:border-r-0"
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
                    </div>
                  );
                })}
              </div>

              {/* Schedule bars, strictly below the reserved date strip */}
              <div
                style={{ top: DAY_HEADER_HEIGHT }}
                className={`absolute inset-x-0 bottom-0 ${
                  scrollable
                    ? "pointer-events-auto overflow-y-auto overflow-x-hidden"
                    : "pointer-events-none"
                }`}
              >
                <div
                  className="relative w-full"
                  style={{ height: `${contentHeight}px` }}
                >
                  {segments.map((segment) => (
                    <ScheduleBar
                      key={segment.key}
                      segment={segment}
                      onSelectRecipe={onSelectRecipe}
                      onDeleteSchedule={onDeleteSchedule}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
