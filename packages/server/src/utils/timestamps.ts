/**
 * Timestamp normalisation.
 *
 * The database package stores `timestamp with time zone` columns and returns
 * them as strings. Depending on the driver and column mode, those strings can
 * be either ISO-8601 or PostgreSQL's own text format
 * (`2026-11-13 10:01:07.564996-06`).
 *
 * The API contract requires ISO-8601 UTC timestamps, so values are normalised
 * here — at the boundary between the database package and the wire format.
 */

const POSTGRES_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

function parseOffset(offset: string | undefined): number {
  if (!offset || offset === "Z") return 0;

  const sign = offset.startsWith("-") ? -1 : 1;
  const digits = offset.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4) || "0");

  return sign * (hours * 60 + minutes) * 60_000;
}

/**
 * Converts a database timestamp into an ISO-8601 UTC string.
 *
 * Values that are already ISO-8601 are normalised to UTC; unparsable values
 * are passed through unchanged so no information is silently lost.
 */
export function toIsoTimestamp(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return "";

  const match = POSTGRES_TIMESTAMP.exec(trimmed);
  if (!match) {
    // Already ISO-8601 (or something we should not silently rewrite).
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }

  const [, year, month, day, hour, minute, second, fraction, offset] = match;

  const milliseconds = fraction ? Number(fraction.slice(0, 3).padEnd(3, "0")) : 0;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );

  return new Date(utc - parseOffset(offset)).toISOString();
}
