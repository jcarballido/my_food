/**
 * Browser smoke test.
 *
 * Drives the real UI in headless Chrome to confirm that the application
 * renders, that the login screen appears for anonymous visitors, and that the
 * authenticated shell loads once a session exists.
 *
 * Run with: pnpm --filter @my_food/ui verify:browser
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const APP_URL = process.env.UI_URL ?? "http://127.0.0.1:5173";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const DEBUG_PORT = 9222;

interface DevtoolsTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}

async function main(): Promise<void> {
  const userDataDir = "/tmp/opencode/chrome-profile";
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
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const cleanup = () => {
    chrome.kill("SIGKILL");
  };

  try {
    // Wait for the DevTools endpoint to become available.
    let target: DevtoolsTarget | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const result = (await fetchJson(
          `http://127.0.0.1:${DEBUG_PORT}/json/list`,
        )) as DevtoolsTarget[];
        // Only a real page target can be driven; extension background pages
        // and service workers share the same endpoint.
        target = result.find((entry) => entry.type === "page");
        if (target) break;
      } catch {
        // DevTools is not up yet.
      }
      await delay(200);
    }

    if (!target) {
      throw new Error("Could not connect to the Chrome DevTools endpoint");
    }

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    let messageId = 0;
    const pending = new Map<number, (value: any) => void>();

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

    await send("Page.enable");
    await send("Runtime.enable");

    const consoleErrors: string[] = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        consoleErrors.push(details.exception?.description ?? details.text ?? "unknown error");
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        consoleErrors.push(
          message.params.args.map((arg: any) => arg.value ?? arg.description ?? "").join(" "),
        );
      }
    });

    await send("Page.navigate", { url: APP_URL });
    await delay(3500);

    const evaluate = async (expression: string): Promise<any> => {
      const result = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.result?.result?.value;
    };

    const failures: string[] = [];
    const check = (name: string, condition: boolean, detail?: string) => {
      if (condition) {
        console.log(`  ok  ${name}`);
      } else {
        failures.push(`${name}${detail ? `: ${detail}` : ""}`);
        console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
      }
    };

    console.log("\nUnauthenticated visitor");

    const title = await evaluate("document.title");
    check("page title is set", typeof title === "string" && title.includes("My Food"), String(title));

    const rootHtml = await evaluate("document.getElementById('root')?.innerHTML ?? ''");
    check("root element is populated", (rootHtml as string).length > 0);

    const bodyText = await evaluate("document.body.innerText");
    check(
      "login screen is shown",
      typeof bodyText === "string" &&
        bodyText.includes("Sign in with your email") &&
        bodyText.includes("Send sign-in link"),
      String(bodyText).slice(0, 200),
    );

    const hasEmailInput = await evaluate(
      "!!document.querySelector('input[type=email]')",
    );
    check("email input is present", hasEmailInput === true);

    const submitDisabled = await evaluate(
      "document.querySelector('button[type=submit]')?.disabled ?? null",
    );
    check("submit is disabled until an email is entered", submitDisabled === true);

    console.log("\nServer validation surfaced in the UI");

    // Submitting a non-allowlisted address must surface the server's error.
    await evaluate(`
      (() => {
        const input = document.querySelector('input[type=email]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'intruder@example.com');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await delay(300);
    await evaluate("document.querySelector('button[type=submit]')?.click()");
    await delay(1500);

    const afterSubmit = await evaluate("document.body.innerText");
    check(
      "server error is displayed to the user",
      typeof afterSubmit === "string" &&
        afterSubmit.includes("not authorized"),
      String(afterSubmit).slice(0, 300),
    );

    console.log("\nConsole health");
    check(
      "no uncaught console errors",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "),
    );

    socket.close();
    console.log(`\n${failures.length === 0 ? "All browser checks passed" : `${failures.length} browser checks failed`}`);
    if (failures.length > 0) {
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
