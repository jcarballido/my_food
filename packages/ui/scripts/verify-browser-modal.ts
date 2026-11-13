/**
 * Verification of the scheduling modal's date methods.
 *
 * CLIENT.md requires two equivalent ways to define a schedule — start/end date
 * and start/duration — that can be switched between without losing the
 * selected start date.
 *
 * Run with: pnpm --filter @my_food/ui verify:browser:modal
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const APP_URL = process.env.UI_URL ?? "http://127.0.0.1:5173";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const DEBUG_PORT = 9226;

interface DevtoolsTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

async function fetchJson(url: string): Promise<unknown> {
  return (await fetch(url)).json();
}

function resolveSupabaseUrl(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const contents = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = /^VITE_SUPABASE_URL=(.+)$/m.exec(contents);
  if (!match) throw new Error("VITE_SUPABASE_URL could not be resolved");
  return match[1].trim();
}

async function main(): Promise<void> {
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
      `--user-data-dir=/tmp/opencode/chrome-profile-modal`,
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
    await send("Page.navigate", { url: APP_URL });
    await delay(2500);

    const session = {
      access_token: process.env.TEST_TOKEN,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "modal-smoke-test",
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        email: "allowed.user@example.com",
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    const storageKey = `sb-${new URL(resolveSupabaseUrl()).hostname.split(".")[0]}-auth-token`;
    await evaluate(
      `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(session))}); true`,
    );

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

    // Open the modal by clicking an empty calendar date.
    await evaluate(`
      document.querySelector('[aria-label="Schedule a recipe on 2026-11-20"]')?.click() ?? false
    `);
    await delay(800);

    const readValues = async () =>
      (await evaluate(`
        (() => {
          const summary = [...document.querySelectorAll('p')]
            .map((element) => element.textContent ?? '')
            .find((text) => text.includes('\\u2192')) ?? '';
          const match = summary.match(/(\\d{4}-\\d{2}-\\d{2})\\s*\\u2192\\s*(\\d{4}-\\d{2}-\\d{2})/);
          return JSON.stringify({
            start: document.querySelector('#schedule-start')?.value ?? null,
            end: document.querySelector('#schedule-end')?.value ?? (match ? match[2] : null),
            duration: document.querySelector('#schedule-duration')?.value ?? null,
            summaryEnd: match ? match[2] : null,
          });
        })()
      `)) as string;

    const setInput = async (selector: string, value: string) =>
      evaluate(`
        (() => {
          const input = document.querySelector(${JSON.stringify(selector)});
          if (!input) return false;
          const proto = input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()
      `);

    const clickByText = async (text: string) =>
      evaluate(`
        (() => {
          const button = [...document.querySelectorAll('button')]
            .find((element) => element.textContent?.trim() === ${JSON.stringify(text)});
          if (!button) return false;
          button.click();
          return true;
        })()
      `);

    console.log("\nDuration method");

    let values = JSON.parse(await readValues());
    check(
      "the start date is prefilled from the clicked cell",
      values.start === "2026-11-20",
      JSON.stringify(values),
    );
    check("duration defaults to 1", values.duration === "1", JSON.stringify(values));

    await setInput("#schedule-duration", "4");
    await delay(400);
    values = JSON.parse(await readValues());
    check(
      "duration of 4 yields an end date three days later",
      values.end === "2026-11-23",
      JSON.stringify(values),
    );

    console.log("\nEnd-date method");

    await clickByText("By end date");
    await delay(400);
    values = JSON.parse(await readValues());
    check(
      "switching to the end-date method keeps the start date",
      values.start === "2026-11-20",
      JSON.stringify(values),
    );
    check(
      "switching to the end-date method derives the same end date",
      values.end === "2026-11-23",
      JSON.stringify(values),
    );

    await setInput("#schedule-end", "2026-11-30");
    await delay(400);
    values = JSON.parse(await readValues());
    check("the end date can be edited directly", values.end === "2026-11-30", JSON.stringify(values));

    console.log("\nSwitching back keeps the range");

    await clickByText("By duration");
    await delay(400);
    values = JSON.parse(await readValues());
    check(
      "the duration is derived from the range",
      values.duration === "11",
      JSON.stringify(values),
    );
    check(
      "the end date is preserved",
      values.end === "2026-11-30",
      JSON.stringify(values),
    );

    console.log("\nChanging the start date recalculates the end date");

    await setInput("#schedule-start", "2026-12-01");
    await delay(400);
    values = JSON.parse(await readValues());
    check(
      "the end date shifts with the start date",
      values.end === "2026-12-11",
      JSON.stringify(values),
    );
    check("the duration is preserved", values.duration === "11", JSON.stringify(values));

    console.log("\nValidation");

    await setInput("#schedule-duration", "0");
    await delay(400);
    const invalidText = await evaluate("document.body.innerText");
    check(
      "a non-positive duration is rejected",
      typeof invalidText === "string" &&
        invalidText.includes("positive whole number"),
      String(invalidText).slice(-300),
    );

    const saveDisabled = await evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((element) => element.textContent?.trim() === 'Save schedule');
        return button ? button.disabled : null;
      })()
    `);
    check("saving is blocked while the form is invalid", saveDisabled === true, String(saveDisabled));

    socket.close();
    console.log(`\n${failures.length === 0 ? "All modal checks passed" : `${failures.length} modal checks failed`}`);
    if (failures.length > 0) {
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    chrome.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
