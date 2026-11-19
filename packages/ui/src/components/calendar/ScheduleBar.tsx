import type { CalendarSegment } from "../../utils/calendarLayout.js";
import { formatDate } from "../../utils/date.js";
import { scheduleColorClasses } from "../../utils/scheduleColors.js";
import { LANE_HEIGHT } from "./layout.js";

interface ScheduleBarProps {
  segment: CalendarSegment;
  onSelectRecipe: (recipeId: string) => void;
  onDeleteSchedule: (
    recipeId: string,
    scheduleId: string,
    recipeName: string,
  ) => void;
}

/**
 * A single segment of a scheduled recipe within one week row.
 *
 * Segments that continue into an adjacent week are rendered without a rounded
 * edge on the joining side, so the bar reads as one continuous shape. Each
 * segment also carries a control that removes just that scheduled meal.
 */
export function ScheduleBar({
  segment,
  onSelectRecipe,
  onDeleteSchedule,
}: ScheduleBarProps) {
  const color = scheduleColorClasses(segment.colorIndex);

  const left = `${(segment.startColumn / 7) * 100}%`;
  const width = `${((segment.endColumn - segment.startColumn + 1) / 7) * 100}%`;
  const top = segment.lane * LANE_HEIGHT + 2;

  const rounding = [
    segment.continuesBefore ? "rounded-l-none" : "rounded-l-md",
    segment.continuesAfter ? "rounded-r-none" : "rounded-r-md",
  ].join(" ");

  const rangeLabel = `${segment.recipeName}${segment.cook ? `, cook ${segment.cook}` : ""}, ${formatDate(segment.startDate)} to ${formatDate(segment.endDate)}`;

  return (
    <div
      style={{ left, width, top, height: LANE_HEIGHT - 4 }}
      className="pointer-events-auto absolute"
    >
      <button
        type="button"
        onClick={() => onSelectRecipe(segment.recipeId)}
        title={rangeLabel}
        aria-label={rangeLabel}
        className={`flex h-full w-full items-center gap-1.5 overflow-hidden border px-2 pr-7 text-left text-[11px] font-semibold leading-tight transition-colors ${color} ${rounding}`}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
        <span className="truncate">{segment.recipeName}</span>
        {segment.cook ? (
          <span
            aria-hidden="true"
            className="shrink-0 rounded-md border border-current px-1 text-[9px] font-extrabold leading-[14px] opacity-80"
          >
            {segment.cook}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() =>
          onDeleteSchedule(segment.recipeId, segment.scheduleId, segment.recipeName)
        }
        aria-label={`Remove ${segment.recipeName} from the calendar`}
        className="absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-paper/80 text-ink-soft opacity-70 transition-opacity hover:bg-paper hover:text-clay hover:opacity-100 focus-visible:opacity-100"
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
