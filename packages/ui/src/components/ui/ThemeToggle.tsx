import { useThemeStore } from "../../stores/themeStore.js";

interface ThemeToggleProps {
  className?: string;
}

/**
 * Subtle icon button that flips between the light and dark palettes.
 *
 * The icon shows the theme the button switches *to*, and the accessible label
 * spells the action out for screen readers.
 */
export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const theme = useThemeStore((state) => state.theme);
  const toggle = useThemeStore((state) => state.toggle);
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={`btn-ghost h-9 w-9 px-0 text-muted hover:text-ink ${className}`}
    >
      {dark ? (
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
