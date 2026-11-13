import type { CalendarSegment } from "../../utils/calendarLayout.js";
import { formatDate } from "../../utils/date.js";
import { DAY_HEADER_HEIGHT, LANE_HEIGHT } from "./layout.js";

interface ScheduleBarProps {
  segment: CalendarSegment;
  onSelectRecipe: (recipeId: string) => void;
}

/** Palette used to distinguish recipes from one another. */
const BAR_COLORS = [
  "bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200",
  "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200",
  "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200",
  "bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-200",
  "bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200",
  "bg-teal-100 text-teal-900 border-teal-300 hover:bg-teal-200",
] as const;

/**
 * A single segment of a scheduled recipe within one week row.
 *
 * Segments that continue into an adjacent week are rendered without a rounded
 * edge on the joining side, so the bar reads as one continuous shape.
 */
export function ScheduleBar({ segment, onSelectRecipe }: ScheduleBarProps) {
  const color = BAR_COLORS[hashRecipeId(segment.recipeId) % BAR_COLORS.length];

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
      className={`pointer-events-auto absolute flex items-center overflow-hidden rounded-md border px-1.5 text-left text-[11px] font-medium leading-tight transition-colors ${color} ${rounding}`}
    >
      <span className="truncate">{segment.recipeName}</span>
    </button>
  );
}

/** Stable colour index for a recipe id. */
function hashRecipeId(recipeId: string): number {
  let hash = 0;
  for (let index = 0; index < recipeId.length; index += 1) {
    hash = (hash * 31 + recipeId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
