/**
 * Calendar rendering constants.
 *
 * Shared between the grid and the bars so the row height and the bar
 * positions cannot drift apart.
 */

/** Height reserved for the date number at the top of each day cell. */
export const DAY_HEADER_HEIGHT = 26;

/** Vertical space taken by a single bar lane, including the gap below it. */
export const LANE_HEIGHT = 26;

/** Minimum height of a week row, used when few recipes overlap. */
export const MIN_WEEK_ROW_HEIGHT = 104;

/**
 * Height a week row needs so that every bar lane fits inside it.
 *
 * Bars are absolutely positioned and therefore do not contribute to the row
 * height, so the row has to be sized explicitly. Without this, a fourth
 * overlapping recipe would be painted over the following week.
 */
export function getWeekRowHeight(maxLanes: number): number {
  const required = DAY_HEADER_HEIGHT + Math.max(maxLanes, 1) * LANE_HEIGHT + 6;
  return Math.max(MIN_WEEK_ROW_HEIGHT, required);
}
