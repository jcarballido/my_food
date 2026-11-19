interface SpinnerProps {
  label?: string;
  className?: string;
}

/** Indeterminate loading indicator with an accessible label. */
export function Spinner({ label = "Loading", className = "" }: SpinnerProps) {
  return (
    <div className={`flex items-center gap-2 text-sm text-muted ${className}`} role="status">
      <svg
        className="h-4 w-4 animate-spin text-sage-ink/70"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      <span>{label}</span>
    </div>
  );
}

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
}

/** Inline error message used to surface API failures. */
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-2xl border border-clay/30 bg-clay-soft px-3.5 py-2.5 text-sm text-clay-ink"
    >
      <span>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-clay hover:text-ink"
          aria-label="Dismiss error"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
