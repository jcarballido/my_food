import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "dnnr.theme";

/** Reads the saved preference, or `null` when the user has never chosen. */
export function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

/**
 * Light/dark theme state.
 *
 * The initial value follows the saved preference (falling back to the OS
 * setting). `index.html` applies the same rule before React mounts so the
 * first paint does not flash the wrong palette.
 */
export const useThemeStore = create<ThemeState>((set, get) => {
  const initial = readStoredTheme() ?? systemTheme();
  applyTheme(initial);

  return {
    theme: initial,
    setTheme: (theme) => {
      applyTheme(theme);
      try {
        window.localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Storage can be unavailable (private mode); the toggle still works.
      }
      set({ theme });
    },
    toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  };
});
