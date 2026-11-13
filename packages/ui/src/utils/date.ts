/**
 * Calendar date helpers.
 *
 * Dates are handled as plain `YYYY-MM-DD` calendar days so they never shift
 * across timezones the way `Date` objects do.
 */

export const DAY_MS = 86_400_000;

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parses `YYYY-MM-DD` into its numeric parts. */
export function parseIsoDate(iso: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

/** Converts `YYYY-MM-DD` to a UTC timestamp for safe arithmetic. */
export function isoToUtcTimestamp(iso: string): number {
  const { year, month, day } = parseIsoDate(iso);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

/** Converts a UTC timestamp back to `YYYY-MM-DD`. */
export function utcTimestampToIso(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return "";
  return toIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function addDays(iso: string, days: number): string {
  return utcTimestampToIso(isoToUtcTimestamp(iso) + days * DAY_MS);
}

/** Inclusive day count between two dates. */
export function daysInclusive(startIso: string, endIso: string): number {
  return Math.round((isoToUtcTimestamp(endIso) - isoToUtcTimestamp(startIso)) / DAY_MS) + 1;
}

/**
 * Signed number of days from `startIso` to `endIso`.
 * Positive when `endIso` is later, negative when it is earlier.
 */
export function daysBetween(startIso: string, endIso: string): number {
  return Math.round((isoToUtcTimestamp(endIso) - isoToUtcTimestamp(startIso)) / DAY_MS);
}

/** Day of week for a date, `0` = Sunday. */
export function dayOfWeek(iso: string): number {
  return new Date(isoToUtcTimestamp(iso)).getUTCDay();
}

/** Number of days in a 1-based month. */
export function daysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseIsoDate(value);
  return year >= 1 && month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth(year, month);
}

/** True when the date belongs to the given year and 1-based month. */
export function isInMonth(iso: string, year: number, month: number): boolean {
  const { year: y, month: m } = parseIsoDate(iso);
  return y === year && m === month;
}

/**
 * Builds the grid of calendar cells for a month.
 *
 * The grid always starts on Sunday and ends on Saturday, so it contains four,
 * five or six week rows depending on the month.
 */
export function buildMonthGrid(year: number, month: number): string[] {
  const first = toIsoDate(year, month, 1);
  const gridStart = addDays(first, -dayOfWeek(first));

  const last = toIsoDate(year, month, daysInMonth(year, month));
  const gridEnd = addDays(last, 6 - dayOfWeek(last));

  const cells: string[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    cells.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return cells;
}

/** Splits a flat list of dates into week rows of seven days. */
export function chunkIntoWeeks(cells: string[]): string[][] {
  const weeks: string[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** Formats a date for display, e.g. `10 Nov 2026`. */
export function formatDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  const label = MONTH_LABELS[month - 1]?.slice(0, 3) ?? "";
  return `${day} ${label} ${year}`;
}

/** Formats a month/year pair for display, e.g. `November 2026`. */
export function formatMonthYear(month: number, year: number): string {
  return `${MONTH_LABELS[month - 1] ?? month} ${year}`;
}

/** Advances a month/year pair by a number of months. */
export function shiftMonth(
  month: number,
  year: number,
  offset: number,
): { month: number; year: number } {
  const zeroBased = year * 12 + (month - 1) + offset;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

/** True when two `YYYY-MM-DD` dates denote the same calendar day. */
export function isSameDay(a: string, b: string): boolean {
  return a === b;
}

/** True when `iso` falls inside the inclusive range. */
export function isWithinRange(iso: string, startIso: string, endIso: string): boolean {
  return iso >= startIso && iso <= endIso;
}
