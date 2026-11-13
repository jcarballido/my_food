/**
 * Authenticated browser smoke test.
 *
 * Establishes a session in the browser (by seeding the Supabase session in
 * localStorage) and then verifies the authenticated shell: the calendar grid,
 * the recipe drawer, and the continuous schedule bars.
 *
 * Run with: pnpm --filter @my_food/ui verify:browser:app
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const APP_URL = process.env.UI_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3199";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const DEBUG_PORT = 9224;

/**
 * Supabase derives its localStorage key from the project URL:
 * `sb-<first label of the hostname>-auth-token`.
 */
function resolveSupabaseUrl(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;

  const envPath = new URL("../.env", import.meta.url);
  const contents = readFileSync(envPath, "utf8");
  const match = /^VITE_SUPABASE_URL=(.+)$/m.exec(contents);
  if (!match) throw new Error("VITE_SUPABASE_URL could not be resolved");
  return match[1].trim();
}

interface DevtoolsTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

async function fetchJson(url: string): Promise<unknown> {
  return (await fetch(url)).json();
}

async function main(): Promise<void> {
  // Seed deterministic data for the calendar assertions.
  const userId = "11111111-1111-4111-8111-111111111111";
  const email = "allowed.user@example.com";

  const seedResponse = await fetch(`${API_URL}/api/recipes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TEST_TOKEN ?? ""}`,
    },
    body: JSON.stringify({
      name: `Browser seeded ${Date.now().toString(36)}`,
      notes: "Seeded by the browser smoke test",
    }),
  });

  if (!seedResponse.ok) {
    throw new Error(
      `Unable to seed data (HTTP ${seedResponse.status}). Set TEST_TOKEN to a valid access token.`,
    );
  }

  const seeded = (await seedResponse.json()) as { recipe: { id: string; name: string } };

  const scheduleResponse = await fetch(`${API_URL}/api/recipes/${seeded.recipe.id}/schedules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TEST_TOKEN ?? ""}`,
    },
    body: JSON.stringify({ start_date: "2026-11-10", end_date: "2026-11-13" }),
  });

  if (!scheduleResponse.ok) {
    throw new Error(`Unable to seed a schedule (HTTP ${scheduleResponse.status})`);
  }

  const chrome: ChildProcess = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=/tmp/opencode/chrome-profile-app`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    let target: DevtoolsTarget | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const result = (await fetchJson(
          `http://127.0.0.1:${DEBUG_PORT}/json/list`,
        )) as DevtoolsTarget[];
        target = result.find((entry) => entry.type === "page");
        if (target) break;
      } catch {
        // DevTools is not up yet.
      }
      await delay(200);
    }

    if (!target) throw new Error("Could not connect to the Chrome DevTools endpoint");

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map<number, (value: any) => void>();
    let messageId = 0;

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)!(message);
        pending.delete(message.id);
      }
    });

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("DevTools socket failed")));
    });

    const send = (method: string, params: Record<string, unknown> = {}): Promise<any> => {
      const id = ++messageId;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    };

    const evaluate = async (expression: string): Promise<any> => {
      const result = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.result?.exceptionDetails) {
        throw new Error(result.result.exceptionDetails.text ?? "evaluation failed");
      }
      return result.result?.result?.value;
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    const consoleErrors: string[] = [];
    let calendarRequests = 0;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.exceptionThrown") {
        consoleErrors.push(message.params.exceptionDetails.text);
      }
      if (message.method === "Network.requestWillBeSent" &&
          message.params.request.method === "GET" &&
          message.params.request.url.includes("/api/calendar?")) calendarRequests++;
    });
    await send("Page.navigate", { url: APP_URL });
    await delay(2500);

    // Seed a Supabase session so the app renders its authenticated shell.
    const session = {
      access_token: process.env.TEST_TOKEN,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "browser-smoke-test",
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email,
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    const storageKey = `sb-${new URL(resolveSupabaseUrl()).hostname.split(".")[0]}-auth-token`;
    await evaluate(`
      (() => {
        const key = ${JSON.stringify(storageKey)};
        const value = ${JSON.stringify(JSON.stringify(session))};
        localStorage.setItem(key, value);
        return localStorage.getItem(key) !== null;
      })()
    `);

    await send("Page.navigate", { url: APP_URL });
    await delay(4000);

    const failures: string[] = [];
    const check = (name: string, condition: boolean, detail?: string) => {
      if (condition) {
        console.log(`  ok  ${name}`);
      } else {
        failures.push(`${name}${detail ? `: ${detail}` : ""}`);
        console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
      }
    };

    console.log("\nAuthenticated shell");

    const bodyText = await evaluate("document.body.innerText");
    check(
      "login screen is gone",
      typeof bodyText === "string" && !bodyText.includes("Send sign-in link"),
      String(bodyText).slice(0, 200),
    );

    check(
      "sign out control is present",
      typeof bodyText === "string" && bodyText.includes("Sign out"),
    );

    console.log("\nCalendar");

    const calendarCells = await evaluate(
      "document.querySelectorAll('[aria-label^=\"Schedule a recipe on\"]').length",
    );
    check("calendar renders day cells", (calendarCells as number) >= 28, String(calendarCells));

    const weekdayHeadings = await evaluate(
      "/\\bsun\\b/i.test(document.body.innerText) && /\\bsat\\b/i.test(document.body.innerText)",
    );
    check("weekday headings are rendered", weekdayHeadings === true);

    const barLabels = await evaluate(`
      JSON.stringify([...document.querySelectorAll('button[title]')]
        .map((element) => element.getAttribute('title'))
        .filter((title) => title && title.includes('to')))
    `);
    const bars = JSON.parse((barLabels as string) ?? "[]") as string[];
    check("at least one schedule bar is rendered", bars.length > 0, JSON.stringify(bars.slice(0, 3)));

    const seededBar = bars.find((title) => title.includes(seeded.recipe.name));
    check(
      "the seeded recipe appears as a bar",
      seededBar !== undefined,
      JSON.stringify(bars.slice(0, 5)),
    );

    console.log("\nContinuous bar geometry");

    // A schedule spanning 10–13 November must render as one bar per week row,
    // and the bar must cover all four dates within its week.
    const geometry = await evaluate(`
      (() => {
        const bar = [...document.querySelectorAll('button[title]')].find((element) =>
          (element.getAttribute('title') || '').includes(${JSON.stringify(seeded.recipe.name)}));
        if (!bar) return null;
        const rect = bar.getBoundingClientRect();
        const cell = document.querySelector('[aria-label=\"Schedule a recipe on 2026-11-10\"]');
        const cellRect = cell ? cell.getBoundingClientRect() : null;
        const lastCell = document.querySelector('[aria-label=\"Schedule a recipe on 2026-11-13\"]');
        const lastRect = lastCell ? lastCell.getBoundingClientRect() : null;
        return JSON.stringify({
          width: rect.width,
          left: rect.left,
          cellLeft: cellRect?.left ?? null,
          cellWidth: cellRect?.width ?? null,
          lastCellRight: lastRect?.right ?? null,
          text: bar.textContent,
        });
      })()
    `);

    const parsed = JSON.parse((geometry as string) ?? "null") as {
      width: number;
      left: number;
      cellLeft: number | null;
      cellWidth: number | null;
      lastCellRight: number | null;
      text: string;
    } | null;

    check("the bar element was found", parsed !== null);

    if (parsed) {
      // The bar covers four of the seven day columns, so it must be exactly
      // four day-cell widths wide.
      const expected = (parsed.cellWidth ?? 0) * 4;
      check(
        "the bar spans all four scheduled dates",
        Math.abs(parsed.width - expected) < 4,
        `width=${parsed.width.toFixed(1)} expected≈${expected.toFixed(1)}`,
      );
      check(
        "the bar starts on the first scheduled date",
        parsed.cellLeft !== null && Math.abs(parsed.left - parsed.cellLeft) < 4,
        `left=${parsed.left.toFixed(1)} cellLeft=${parsed.cellLeft}`,
      );
      check(
        "the bar ends on the last scheduled date",
        parsed.lastCellRight !== null &&
          Math.abs(parsed.left + parsed.width - parsed.lastCellRight) < 4,
        `right=${(parsed.left + parsed.width).toFixed(1)} expected≈${parsed.lastCellRight}`,
      );
      check("the bar shows the recipe name", parsed.text.includes(seeded.recipe.name), parsed.text);
    }

    console.log("\nRecipe drawer");

    const drawerText = await evaluate("document.body.innerText");
    check(
      "the recipe list is visible",
      typeof drawerText === "string" && /recipes/i.test(drawerText),
      String(drawerText).slice(-400),
    );
    check(
      "the seeded recipe is listed",
      typeof drawerText === "string" && drawerText.includes(seeded.recipe.name),
    );

    const click = async (text: string) => {
      await evaluate(`(() => {
        const scope = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document;
        const button = [...scope.querySelectorAll('button')]
          .find(el => el.textContent.trim() === ${JSON.stringify(text)} && el.getClientRects().length);
        if (!button) throw new Error('Button not found: ' + ${JSON.stringify(text)});
        button.click();
      })()`);
      await delay(150);
    };
    const enter = async (selector: string, value: string) => {
      await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await delay(150);
    };

    await click("Hide recipes");
    check("desktop drawer collapses", await evaluate("document.getElementById('recipe-drawer').getClientRects().length === 0"));
    await click("Show recipes");
    check("desktop drawer expands", await evaluate("document.getElementById('recipe-drawer').getClientRects().length > 0"));

    await evaluate(`document.querySelector('button[title*=${JSON.stringify(seeded.recipe.name)}]').click()`);
    await delay(200);
    await click("Edit");
    await enter("#recipe-name", "Unsaved browser edit");
    await evaluate("document.querySelector('button:has(.sr-only)')?.click()");
    await delay(200);
    check("Back prompts before discarding edits", await evaluate("document.querySelector('dialog[role=alertdialog]').open"));
    await click("Cancel");
    check("canceling discard preserves the edit", await evaluate("document.querySelector('#recipe-name').value === 'Unsaved browser edit'"));
    await click("Hide recipes");
    await click("Show recipes");
    check("collapsing the drawer preserves the draft", await evaluate("document.querySelector('#recipe-name').value === 'Unsaved browser edit'"));
    await evaluate("document.querySelector('button:has(.sr-only)')?.click()");
    await delay(150);
    await click("Discard changes");
    check("confirmed discard returns to the list", await evaluate("!document.querySelector('#recipe-name')"));

    const beforeNavigation = calendarRequests;
    await evaluate("document.querySelector('[aria-label^=\"Next month\"]').click()");
    await delay(600);
    check("month navigation fetches once", calendarRequests - beforeNavigation === 1, String(calendarRequests - beforeNavigation));
    await evaluate("document.querySelector('[aria-label^=\"Previous month\"]').click()");
    await delay(600);

    check("stale calendar responses cannot replace the latest month", await evaluate(`(async () => {
      // Reuse Vite's loaded URLs, including HMR version parameters.
      const moduleUrl = path => performance.getEntriesByType('resource')
        .map(entry => entry.name).find(url => new URL(url).pathname === path);
      const { useCalendarStore: store } = await import(moduleUrl('/src/stores/calendarStore.ts'));
      const { calendarService } = await import(moduleUrl('/src/services/index.ts'));
      const original = calendarService.getMonth;
      const snapshot = store.getState();
      const pending = [];
      calendarService.getMonth = () => new Promise(resolve => pending.push(resolve));
      try {
        const older = store.getState().load();
        const newer = store.getState().load();
        pending[1]([{ id: 'latest', schedules: [] }]);
        await newer;
        pending[0]([{ id: 'stale', schedules: [] }]);
        await older;
        return store.getState().recipes[0]?.id === 'latest';
      } finally {
        calendarService.getMonth = original;
        store.setState(snapshot);
      }
    })()`));

    check("overlapping bars fit inside their week rows", await evaluate(`(() => {
      return [...document.querySelectorAll('button[title]')].every(bar => {
        const row = bar.parentElement.parentElement.getBoundingClientRect();
        return bar.getBoundingClientRect().bottom <= row.bottom;
      });
    })()`));

    console.log("\nScheduling modal");

    const modalOpened = await evaluate(`
      (() => {
        const cell = document.querySelector('[aria-label="Schedule a recipe on 2026-11-20"]');
        if (!cell) return false;
        cell.click();
        return true;
      })()
    `);
    check("clicking a date opens the modal", modalOpened === true);
    await delay(800);

    const modalText = await evaluate("document.body.innerText");
    check(
      "the scheduling modal is shown",
      typeof modalText === "string" && modalText.includes("Schedule a recipe"),
      String(modalText).slice(0, 200),
    );

    const startDateValue = await evaluate(
      "document.querySelector('#schedule-start')?.value ?? null",
    );
    check(
      "the clicked date pre-populates the start date",
      startDateValue === "2026-11-20",
      String(startDateValue),
    );

    const durationValue = await evaluate(
      "document.querySelector('#schedule-duration')?.value ?? null",
    );
    check("duration is prefilled", durationValue !== null, String(durationValue));

    const modeButtons = await evaluate(`
      JSON.stringify([...document.querySelectorAll('button')]
        .map((element) => element.textContent?.trim())
        .filter((text) => text === 'By duration' || text === 'By end date'))
    `);
    check(
      "both date input methods are offered",
      (JSON.parse((modeButtons as string) ?? "[]") as string[]).length === 2,
    );

    console.log("\nConsole health");
    await click("New recipe");
    await enter("#new-recipe-name", "Unsaved schedule draft");
    await evaluate("document.querySelector('dialog[open] [aria-label=\"Close dialog\"]').click()");
    await delay(200);
    check("closing the schedule prompts before discarding", await evaluate("document.querySelector('dialog[role=alertdialog]').open"));
    await click("Cancel");
    check("canceling preserves the schedule draft", await evaluate("document.querySelector('#new-recipe-name').value === 'Unsaved schedule draft'"));
    await evaluate("document.querySelector('dialog[open] [aria-label=\"Close dialog\"]').click()");
    await delay(150);
    await click("Discard changes");
    check("confirmed discard closes the schedule", await evaluate("document.querySelectorAll('dialog[open]').length === 0"));
    check("no uncaught browser errors", consoleErrors.length === 0, consoleErrors.join("; "));
    socket.close();

    console.log(`\n${failures.length === 0 ? "All browser checks passed" : `${failures.length} browser checks failed`}`);
    if (failures.length > 0) {
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    chrome.kill("SIGKILL");
    await fetch(`${API_URL}/api/recipes/${seeded.recipe.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${process.env.TEST_TOKEN ?? ""}` },
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
