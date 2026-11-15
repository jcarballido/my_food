import type { CalendarSegment } from "../../utils/calendarLayout.js";
import { formatDate } from "../../utils/date.js";
import { scheduleColorClasses } from "../../utils/scheduleColors.js";
import { DAY_HEADER_HEIGHT, LANE_HEIGHT } from "./layout.js";

interface ScheduleBarProps {
  segment: CalendarSegment;
  onSelectRecipe: (recipeId: string) => void;
}

/**
 * A single segment of a scheduled recipe within one week row.
 *
 * Segments that continue into an adjacent week are rendered without a rounded
 * edge on the joining side, so the bar reads as one continuous shape.
 */
export function ScheduleBar({ segment, onSelectRecipe }: ScheduleBarProps) {
  const color = scheduleColorClasses(segment.colorIndex);

  const left = `${(segment.startColumn / 7) * 100}%`;
  const width = `${((segment.endColumn - segment.startColumn + 1) / 7) * 100}%`;
  const top = segment.lane * LANE_HEIGHT + DAY_HEADER_HEIGHT;

  const rounding = [
    segment.continuesBefore ? "rounded-l-none" : "rounded-l-md",
    segment.continuesAfter ? "rounded-r-none" : "rounded-r-md",
  ].join(" ");

  const rangeLabel = `${segment.recipeName}, ${formatDate(segment.startDate)} to ${formatDate(segment.endDate)}`;

  return (
    <button
      type="button"
      onClick={() => onSelectRecipe(segment.recipeId)}
      title={rangeLabel}
      aria-label={rangeLabel}
      style={{ left, width, top, height: LANE_HEIGHT - 4 }}
      className={`pointer-events-auto absolute flex items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-left text-[11px] font-semibold leading-tight transition-colors ${color} ${rounding}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
      <span className="truncate">{segment.recipeName}</span>
    </button>
  );
}
