/**
 * Calendar rendering constants.
 *
 * Shared between the grid and the bars so the row height and the bar
 * positions cannot drift apart.
 */

/** Height reserved for the date number at the top of each week row. */
export const DAY_HEADER_HEIGHT = 36;

/** Vertical space taken by a single bar lane, including the gap below it. */
export const LANE_HEIGHT = 26;

/**
 * Height of every week row.
 *
 * Rows are deliberately fixed: adding, moving or removing schedules must not
 * resize the calendar or shift the dates around. When a week has more meals
 * than fit, only that week's bar area scrolls.
 */
export const WEEK_ROW_HEIGHT = 148;
