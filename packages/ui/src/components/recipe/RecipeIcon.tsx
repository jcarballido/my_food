import { Beef, Egg, Fish, Utensils, type LucideIcon } from "lucide-react";
import type { RecipeIconName } from "../../types/api.js";

/** Icons a recipe can display, with the labels shown in the icon picker. */
export const RECIPE_ICON_OPTIONS: Array<{ value: RecipeIconName; label: string }> = [
  { value: "utensils", label: "Default" },
  { value: "fish", label: "Fish" },
  { value: "beef", label: "Beef" },
  { value: "egg", label: "Poultry" },
];

const ICON_COMPONENTS: Record<RecipeIconName, LucideIcon> = {
  utensils: Utensils,
  fish: Fish,
  beef: Beef,
  egg: Egg,
};

interface RecipeIconProps {
  name: RecipeIconName | null | undefined;
  className?: string;
  strokeWidth?: number;
}

/** Renders a recipe's icon, falling back to `utensils` for unknown values. */
export function RecipeIcon({ name, className, strokeWidth = 1.5 }: RecipeIconProps) {
  const Icon = ICON_COMPONENTS[name ?? "utensils"] ?? Utensils;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
