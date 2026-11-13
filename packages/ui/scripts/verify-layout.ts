/**
 * Verification of the calendar layout algorithm.
 *
 * The bar layout is the most intricate part of the UI: schedules must render
 * as continuous bars across week rows and month boundaries, recipes must never
 * hide one another, and each recipe must appear exactly once.
 *
 * Run with: pnpm --filter @my_food/ui verify
 */
import assert from "node:assert/strict";
import { buildCalendarLayout, type ScheduleEntry } from "../src/utils/calendarLayout.js";
import { addDays, buildMonthGrid, chunkIntoWeeks, daysInclusive } from "../src/utils/date.js";
import type { CalendarRecipe, Schedule } from "../src/types/api.js";

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
    console.log(`FAIL  ${name}\n      ${(error as Error).message}`);
  }
}

function schedule(id: string, start: string, end: string): Schedule {
  return {
    id,
    recipe_id: `recipe-${id}`,
    start_date: start,
    end_date: end,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function calendarRecipe(id: string, schedules: Schedule[]): CalendarRecipe {
  return {
    id,
    name: `Recipe ${id}`,
    notes: null,
    url: null,
    created_by: "user",
    updated_by: "user",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ingredients: [],
    schedules,
  };
}

async function main(): Promise<void> {
  console.log("\nDate helpers");

  await test("month grid always spans whole weeks", () => {
    for (let month = 1; month <= 12; month += 1) {
      const cells = buildMonthGrid(2026, month);
      assert.equal(cells.length % 7, 0, `grid for month ${month} is not a multiple of 7`);
      assert.ok(cells.length >= 28 && cells.length <= 42, `unexpected grid size for ${month}`);

      // The grid starts on the Sunday on or before the 1st and ends on the
      // Saturday on or after the last day of the month.
      const firstOfMonth = `2026-${String(month).padStart(2, "0")}-01`;
      assert.ok(cells[0] <= firstOfMonth, "grid must start on or before the 1st");
      assert.ok(cells[cells.length - 1] >= firstOfMonth, "grid must end after the 1st");
    }
  });

  await test("November 2026 grid spans five weeks", () => {
    const weeks = chunkIntoWeeks(buildMonthGrid(2026, 11));
    assert.equal(weeks.length, 5);
    assert.equal(weeks[0][0], "2026-11-01");
    assert.equal(weeks[4][6], "2026-12-05");
  });

  await test("duration is inclusive of both endpoints", () => {
    assert.equal(daysInclusive("2026-11-10", "2026-11-13"), 4);
    assert.equal(daysInclusive("2026-11-10", "2026-11-10"), 1);
  });

  await test("addDays crosses month and year boundaries", () => {
    assert.equal(addDays("2026-11-30", 1), "2026-12-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  });

  console.log("\nCalendar layout");

  await test("a schedule inside one week produces a single segment", () => {
    const layout = buildCalendarLayout(
      [calendarRecipe("a", [schedule("s1", "2026-11-10", "2026-11-12")])],
      2026,
      11,
    );
    const segments = layout.segmentsByWeek.flat();
    assert.equal(segments.length, 1);
    // 2026-11-01 is a Sunday, so 2026-11-10 is a Tuesday (column 2).
    assert.equal(segments[0].startColumn, 2);
    assert.equal(segments[0].endColumn, 4);
    assert.equal(segments[0].lane, 0);
    assert.equal(segments[0].isStart, true);
    assert.equal(segments[0].isEnd, true);
  });

  await test("a schedule crossing a week boundary produces two segments", () => {
    // 2026-11-08 is a Sunday; the range covers into the following week.
    const layout = buildCalendarLayout(
      [calendarRecipe("a", [schedule("s1", "2026-11-05", "2026-11-11")])],
      2026,
      11,
    );
    const segments = layout.segmentsByWeek.flat();
    assert.equal(segments.length, 2);
    assert.equal(segments[0].weekIndex, 0);
    assert.equal(segments[0].continuesAfter, true);
    assert.equal(segments[0].isEnd, false);
    assert.equal(segments[1].weekIndex, 1);
    assert.equal(segments[1].continuesBefore, true);
    assert.equal(segments[1].isStart, false);
    assert.equal(segments[1].isEnd, true);
  });

  await test("segments of one schedule stay in the same lane across weeks", () => {
    const layout = buildCalendarLayout(
      [calendarRecipe("a", [schedule("s1", "2026-11-02", "2026-11-20")])],
      2026,
      11,
    );
    const segments = layout.segmentsByWeek.flat();
    assert.ok(segments.length >= 3);
    assert.ok(
      segments.every((segment) => segment.lane === 0),
      "a lone schedule must not be pushed into another lane",
    );
  });

  await test("overlapping recipes are stacked into separate lanes", () => {
    const layout = buildCalendarLayout(
      [
        calendarRecipe("a", [schedule("s1", "2026-11-10", "2026-11-12")]),
        calendarRecipe("b", [schedule("s2", "2026-11-11", "2026-11-13")]),
      ],
      2026,
      11,
    );
    const segments = layout.segmentsByWeek.flat();
    assert.equal(segments.length, 2);
    assert.equal(layout.maxLanes, 2);
    const lanes = segments.map((segment) => segment.lane).sort();
    assert.deepEqual(lanes, [0, 1]);
  });

  await test("non-overlapping recipes share a lane", () => {
    const layout = buildCalendarLayout(
      [
        calendarRecipe("a", [schedule("s1", "2026-11-02", "2026-11-03")]),
        calendarRecipe("b", [schedule("s2", "2026-11-09", "2026-11-10")]),
      ],
      2026,
      11,
    );
    assert.equal(layout.maxLanes, 1);
  });

  await test("a schedule crossing the month boundary is clipped for position but keeps its dates", () => {
    const layout = buildCalendarLayout(
      [calendarRecipe("a", [schedule("s1", "2026-10-28", "2026-11-05")])],
      2026,
      11,
    );
    const segments = layout.segmentsByWeek.flat();
    assert.ok(segments.length >= 1);

    // The first segment starts at the first column of the first week.
    assert.equal(segments[0].startColumn, 0);
    assert.equal(segments[0].continuesBefore, true);

    // The original, unclipped dates are preserved.
    for (const segment of segments) {
      assert.equal(segment.startDate, "2026-10-28");
      assert.equal(segment.endDate, "2026-11-05");
    }
  });

  await test("a schedule entirely outside the visible grid is omitted", () => {
    // The November grid spans 2026-11-01 to 2026-12-05.
    const layout = buildCalendarLayout(
      [calendarRecipe("a", [schedule("s1", "2026-12-10", "2026-12-20")])],
      2026,
      11,
    );
    assert.equal(layout.segmentsByWeek.flat().length, 0);
  });

  await test("a schedule inside the grid but outside the month is still positioned", () => {
    // 2026-12-01..05 falls in the trailing days of the November grid, so it
    // is visible in the grid even though it belongs to December.
    const layout = buildCalendarLayout(
      [calendarRecipe("a", [schedule("s1", "2026-12-01", "2026-12-05")])],
      2026,
      11,
    );
    const segments = layout.segmentsByWeek.flat();
    assert.equal(segments.length, 1);
    assert.equal(segments[0].weekIndex, 4);
  });

  await test("a recipe with two schedules renders both bars", () => {
    const layout = buildCalendarLayout(
      [
        calendarRecipe(
          "a",
          [
            schedule("s1", "2026-11-10", "2026-11-12"),
            schedule("s2", "2026-11-20", "2026-11-22"),
          ],
        ),
      ],
      2026,
      11,
    );
    const segments = layout.segmentsByWeek.flat();

    // s1 occupies one week; s2 spans the week containing the 20th and the
    // following one, so three segments are produced in total.
    assert.equal(segments.length, 3);
    assert.equal(new Set(segments.map((segment) => segment.recipeId)).size, 1);
    assert.equal(new Set(segments.map((segment) => segment.scheduleId)).size, 2);

    const firstOfSecond = segments.filter((segment) => segment.scheduleId === "s2");
    assert.equal(firstOfSecond.length, 2);
    assert.equal(firstOfSecond[0].isStart, true);
    assert.equal(firstOfSecond[0].isEnd, false);
    assert.equal(firstOfSecond[1].isStart, false);
    assert.equal(firstOfSecond[1].isEnd, true);
  });

  await test("each recipe produces exactly one segment per week row", () => {
    const layout = buildCalendarLayout(
      [
        calendarRecipe("a", [schedule("s1", "2026-11-02", "2026-11-30")]),
        calendarRecipe("b", [schedule("s2", "2026-11-09", "2026-11-15")]),
      ],
      2026,
      11,
    );

    for (let weekIndex = 0; weekIndex < layout.weeks.length; weekIndex += 1) {
      const inWeek = layout.segmentsByWeek[weekIndex];
      const perRecipe = new Map<string, number>();
      for (const segment of inWeek) {
        perRecipe.set(segment.recipeId, (perRecipe.get(segment.recipeId) ?? 0) + 1);
      }
      for (const [recipeId, count] of perRecipe) {
        assert.equal(count, 1, `recipe ${recipeId} has ${count} segments in week ${weekIndex}`);
      }
    }
  });

  await test("segments never overlap within a lane", () => {
    const layout = buildCalendarLayout(
      [
        calendarRecipe("a", [schedule("s1", "2026-11-02", "2026-11-08")]),
        calendarRecipe("b", [schedule("s2", "2026-11-04", "2026-11-09")]),
        calendarRecipe("c", [schedule("s3", "2026-11-06", "2026-11-12")]),
      ],
      2026,
      11,
    );

    for (const week of layout.segmentsByWeek) {
      const byLane = new Map<number, typeof week>();
      for (const segment of week) {
        const existing = byLane.get(segment.lane) ?? [];
        existing.push(segment);
        byLane.set(segment.lane, existing);
      }
      for (const [lane, segments] of byLane) {
        const sorted = [...segments].sort((a, b) => a.startColumn - b.startColumn);
        for (let index = 1; index < sorted.length; index += 1) {
          assert.ok(
            sorted[index].startColumn > sorted[index - 1].endColumn,
            `lane ${lane} has overlapping segments`,
          );
        }
      }
    }
  });

  await test("segments stay within their own week row bounds", () => {
    const layout = buildCalendarLayout(
      [calendarRecipe("a", [schedule("s1", "2026-10-01", "2026-12-31")])],
      2026,
      11,
    );
    for (const [weekIndex, segments] of layout.segmentsByWeek.entries()) {
      for (const segment of segments) {
        assert.ok(segment.startColumn >= 0 && segment.startColumn <= 6);
        assert.ok(segment.endColumn >= 0 && segment.endColumn <= 6);
        assert.ok(segment.startColumn <= segment.endColumn);
        assert.equal(segment.weekIndex, weekIndex);
      }
    }
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
}

void main();
