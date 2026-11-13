/**
 * Calendar helpers.
 *
 * Schedule ranges are calendar dates (SQL `DATE`), not instants, so all window
 * arithmetic is performed on plain date components. The configured application
 * timezone is used to resolve "today" (and therefore the default month) so the
 * server agrees with the user about which month they are looking at.
 */

export interface MonthWindow {
  /** Inclusive first calendar day of the month, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive last calendar day of the month, `YYYY-MM-DD`. */
  end: string;
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Number of days in the given 1-based month. */
export function getDaysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of the requested month.
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

/**
 * The inclusive first-through-last day window of a calendar month.
 * The window is a calendar-month window, never a rolling 30-day window.
 */
export function getMonthWindow(month: number, year: number, _timezone: string): MonthWindow {
  return {
    start: formatIsoDate(year, month, 1),
    end: formatIsoDate(year, month, getDaysInMonth(year, month)),
  };
}

/** Calendar year/month for an instant, resolved in the given timezone. */
export function getZonedYearMonth(
  date: Date,
  timezone: string,
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

/** Calendar date (`YYYY-MM-DD`) for an instant, resolved in the given timezone. */
export function getZonedIsoDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Adds a whole number of days to a `YYYY-MM-DD` date, returning `YYYY-MM-DD`. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** Inclusive day count between two `YYYY-MM-DD` dates. */
export function daysBetween(startIso: string, endIso: string): number {
  const [startYear, startMonth, startDay] = startIso.split("-").map(Number);
  const [endYear, endMonth, endDay] = endIso.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= getDaysInMonth(year, month);
}
