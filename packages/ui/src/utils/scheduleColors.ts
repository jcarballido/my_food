/**
 * Automatic meal colours.
 *
 * Colours are selected by the calendar layout from a fixed palette; there is
 * no user-facing control over them. Keeping the class strings here (rather
 * than building them dynamically) lets Tailwind discover every variant.
 */
export const SCHEDULE_COLORS = [
  "bg-sage text-sage-ink border-sage-ink/20 hover:bg-sage-deep",
  "bg-peach text-peach-ink border-peach-ink/20 hover:bg-peach-deep",
  "bg-yellow text-yellow-ink border-yellow-ink/20 hover:bg-yellow-deep",
  "bg-lavender text-lavender-ink border-lavender-ink/20 hover:bg-lavender-deep",
  "bg-sky text-sky-ink border-sky-ink/20 hover:bg-sky-deep",
  "bg-rose text-rose-ink border-rose-ink/20 hover:bg-rose-deep",
  "bg-mint text-mint-ink border-mint-ink/20 hover:bg-mint-deep",
  "bg-sand text-sand-ink border-sand-ink/20 hover:bg-sand-deep",
  "bg-periwinkle text-periwinkle-ink border-periwinkle-ink/20 hover:bg-periwinkle-deep",
  "bg-apricot text-apricot-ink border-apricot-ink/20 hover:bg-apricot-deep",
  "bg-teal text-teal-ink border-teal-ink/20 hover:bg-teal-deep",
  "bg-mauve text-mauve-ink border-mauve-ink/20 hover:bg-mauve-deep",
] as const;

export const SCHEDULE_COLOR_COUNT = SCHEDULE_COLORS.length;

/** Classes for a palette index, wrapping so any index is valid. */
export function scheduleColorClasses(index: number): string {
  const normalized =
    ((index % SCHEDULE_COLOR_COUNT) + SCHEDULE_COLOR_COUNT) %
    SCHEDULE_COLOR_COUNT;
  return SCHEDULE_COLORS[normalized];
}
