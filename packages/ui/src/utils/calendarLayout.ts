/**
 * Calendar layout.
 *
 * Scheduled recipes are rendered as continuous bars that span the dates they
 * cover, including across week rows and month boundaries. To achieve that, the
 * visible month grid is projected onto each week row: a schedule that covers
 * several weeks produces one *segment* per week, and the segments are then
 * stacked into lanes so overlapping recipes never hide each other.
 */

import { addDays, buildMonthGrid, chunkIntoWeeks, daysInclusive } from "./date.js";
import { SCHEDULE_COLOR_COUNT } from "./scheduleColors.js";
import type { CalendarRecipe, Schedule } from "../types/api.js";

export interface CalendarSegment {
  /** Unique key for rendering. */
  key: string;
  recipeId: string;
  recipeName: string;
  scheduleId: string;
  /** Inclusive start date of the schedule. */
  startDate: string;
  /** Inclusive end date of the schedule. */
  endDate: string;
  /** Index of the week row this segment belongs to. */
  weekIndex: number;
  /** First column (0-6) covered within the week row. */
  startColumn: number;
  /** Last column (0-6) covered within the week row. */
  endColumn: number;
  /** Lane within the week row; higher lanes render lower. */
  lane: number;
  /** Palette index assigned automatically to the schedule. */
  colorIndex: number;
  /** True when the schedule continues into the previous week row. */
  continuesBefore: boolean;
  /** True when the schedule continues into the next week row. */
  continuesAfter: boolean;
  /** True when this is the schedule's first segment overall. */
  isStart: boolean;
  /** True when this is the schedule's last segment overall. */
  isEnd: boolean;
}

export interface CalendarLayout {
  /** The dates making up the visible grid. */
  cells: string[];
  /** Week rows of seven days each. */
  weeks: string[][];
  /** Segments grouped by week row index. */
  segmentsByWeek: CalendarSegment[][];
  /** Highest lane used in any week row, so rows can be sized consistently. */
  maxLanes: number;
}

export interface ScheduleEntry {
  recipeId: string;
  recipeName: string;
  schedule: Schedule;
}

/** Collects every schedule of every calendar recipe. */
export function collectSchedules(recipes: CalendarRecipe[]): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (const recipe of recipes) {
    for (const schedule of recipe.schedules) {
      entries.push({ recipeId: recipe.id, recipeName: recipe.name, schedule });
    }
  }
  return entries;
}

/**
 * Assigns a palette index to every visible meal.
 *
 * Colours start from a hash of the schedule id so they are deterministic, and
 * a meal keeps one colour across all of its week-row segments. When two
 * visible meals hash to the same palette entry, the later one is moved to the
 * next free entry, which keeps every meal on the calendar distinct.
 */
function assignScheduleColors(entries: ScheduleEntry[]): Map<string, number> {
  const ordered = [...entries].sort(
    (a, b) =>
      a.schedule.start_date.localeCompare(b.schedule.start_date) ||
      a.schedule.id.localeCompare(b.schedule.id),
  );

  const colors = new Map<string, number>();
  const used = new Set<number>();

  for (const entry of ordered) {
    let colorIndex = hashScheduleId(entry.schedule.id) % SCHEDULE_COLOR_COUNT;

    for (
      let offset = 0;
      offset < SCHEDULE_COLOR_COUNT && used.has(colorIndex);
      offset += 1
    ) {
      colorIndex = (colorIndex + 1) % SCHEDULE_COLOR_COUNT;
    }

    used.add(colorIndex);
    colors.set(entry.schedule.id, colorIndex);
  }

  return colors;
}

/** Stable, non-negative hash used as the starting point for a meal colour. */
function hashScheduleId(scheduleId: string): number {
  let hash = 0;
  for (let index = 0; index < scheduleId.length; index += 1) {
    hash = (hash * 31 + scheduleId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Computes the bar layout for a month.
 *
 * Schedules are clipped to the visible grid for *positioning* purposes only —
 * the original start and end dates are preserved on each segment so the UI can
 * show the true range.
 */
export function buildCalendarLayout(
  recipes: CalendarRecipe[],
  year: number,
  month: number,
): CalendarLayout {
  const cells = buildMonthGrid(year, month);
  const weeks = chunkIntoWeeks(cells);

  const gridStart = cells[0];
  const gridEnd = cells[cells.length - 1];

  // Schedules outside the visible grid cannot be seen, so they must not
  // consume a colour that belongs to a meal the user can actually see.
  const entries = collectSchedules(recipes).filter(
    ({ schedule }) =>
      schedule.end_date >= gridStart && schedule.start_date <= gridEnd,
  );
  const colorsBySchedule = assignScheduleColors(entries);

  interface PendingSegment {
    entry: ScheduleEntry;
    weekIndex: number;
    startColumn: number;
    endColumn: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
    isStart: boolean;
    isEnd: boolean;
  }

  const pending: PendingSegment[] = [];

  for (const entry of entries) {
    const { start_date: startDate, end_date: endDate } = entry.schedule;

    // Clip to the visible grid for positioning.
    const visibleStart = startDate < gridStart ? gridStart : startDate;
    const visibleEnd = endDate > gridEnd ? gridEnd : endDate;

    const scheduleSegments: PendingSegment[] = [];

    weeks.forEach((week, weekIndex) => {
      const weekStart = week[0];
      const weekEnd = week[6];

      if (visibleEnd < weekStart || visibleStart > weekEnd) return;

      const startColumn = week.findIndex((day) => day >= visibleStart);
      const endColumn = week.map((day) => day <= visibleEnd).lastIndexOf(true);

      scheduleSegments.push({
        entry,
        weekIndex,
        startColumn: startColumn === -1 ? 0 : startColumn,
        endColumn: endColumn === -1 ? 6 : endColumn,
        continuesBefore: startDate < weekStart,
        continuesAfter: endDate > weekEnd,
        isStart: false,
        isEnd: false,
      });
    });

    // Mark the schedule's first and last segment so the bar can round the
    // outer edges and leave the joined edges square.
    if (scheduleSegments.length > 0) {
      scheduleSegments[0].isStart = true;
      scheduleSegments[scheduleSegments.length - 1].isEnd = true;
    }

    pending.push(...scheduleSegments);
  }

  const segmentsByWeek: CalendarSegment[][] = weeks.map(() => []);
  let maxLanes = 0;

  weeks.forEach((_, weekIndex) => {
    const weekSegments = pending.filter((segment) => segment.weekIndex === weekIndex);

    // Assign lanes so that segments which overlap in time never share a lane.
    const laneEnds: number[] = [];
    const lanes = new Map<PendingSegment, number>();

    const ordered = [...weekSegments].sort(
      (a, b) =>
        a.startColumn - b.startColumn ||
        b.endColumn - a.endColumn ||
        a.entry.schedule.id.localeCompare(b.entry.schedule.id),
    );

    for (const segment of ordered) {
      let lane = laneEnds.findIndex((end) => end < segment.startColumn);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(segment.endColumn);
      } else {
        laneEnds[lane] = segment.endColumn;
      }
      lanes.set(segment, lane);
      maxLanes = Math.max(maxLanes, lane + 1);
    }

    for (const segment of weekSegments) {
      const lane = lanes.get(segment) ?? 0;
      segmentsByWeek[weekIndex].push({
        key: `${segment.entry.schedule.id}-${weekIndex}`,
        recipeId: segment.entry.recipeId,
        recipeName: segment.entry.recipeName,
        scheduleId: segment.entry.schedule.id,
        startDate: segment.entry.schedule.start_date,
        endDate: segment.entry.schedule.end_date,
        weekIndex,
        startColumn: segment.startColumn,
        endColumn: segment.endColumn,
        lane,
        colorIndex: colorsBySchedule.get(segment.entry.schedule.id) ?? 0,
        continuesBefore: segment.continuesBefore,
        continuesAfter: segment.continuesAfter,
        isStart: segment.isStart,
        isEnd: segment.isEnd,
      });
    }
  });

  return { cells, weeks, segmentsByWeek, maxLanes };
}

/** Inclusive duration of a schedule in days. */
export function scheduleDuration(startDate: string, endDate: string): number {
  return daysInclusive(startDate, endDate);
}

/** Date that follows the given one. */
export function nextDay(iso: string): string {
  return addDays(iso, 1);
}
