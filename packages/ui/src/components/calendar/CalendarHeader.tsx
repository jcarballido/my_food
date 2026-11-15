import { WEEKDAY_LABELS, formatMonthYear } from "../../utils/date.js";
import { shiftMonth } from "../../utils/date.js";

interface CalendarHeaderProps {
  month: number;
  year: number;
  busy: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

/** Month navigation header. */
export function CalendarHeader({
  month,
  year,
  busy,
  onPrevious,
  onNext,
  onToday,
}: CalendarHeaderProps) {
  const previous = shiftMonth(month, year, -1);
  const next = shiftMonth(month, year, 1);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          className="btn-secondary h-9 w-9 px-0"
          aria-label={`Previous month, ${formatMonthYear(previous.month, previous.year)}`}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="btn-secondary h-9 w-9 px-0"
          aria-label={`Next month, ${formatMonthYear(next.month, next.year)}`}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onToday}
          className="btn-ghost h-9 px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
        >
          Today
        </button>
      </div>

      <h2 className="text-2xl font-medium text-ink" aria-live="polite">
        {formatMonthYear(month, year)}
        {busy ? <span className="sr-only"> (loading)</span> : null}
      </h2>

      <div aria-hidden="true" className="hidden sm:block" />
    </header>
  );
}

interface WeekdayRowProps {
  className?: string;
}

/** The Sunday–Saturday column headings. */
export function WeekdayRow({ className = "" }: WeekdayRowProps) {
  return (
    <div
      className={`grid grid-cols-7 border-b border-line/80 bg-cream-deep/55 ${className}`}
      aria-hidden="true"
    >
      {WEEKDAY_LABELS.map((label) => (
        <div
          key={label}
          className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
        >
          {label}
        </div>
      ))}
    </div>
  );
}
