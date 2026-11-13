import { listCalendarRecipes, type CalendarRecipe, type Database } from "@my_food/database";
import { getMonthWindow } from "../utils/calendar.js";

/**
 * Calendar retrieval.
 *
 * The month window is calculated here (and only here) so that route handlers
 * and services cannot drift apart on window semantics.
 */
export class CalendarService {
  constructor(
    private readonly db: Database,
    private readonly timezone: string,
  ) {}

  async getMonthRecipes(month: number, year: number): Promise<CalendarRecipe[]> {
    const window = getMonthWindow(month, year, this.timezone);
    return listCalendarRecipes(this.db, window);
  }
}
