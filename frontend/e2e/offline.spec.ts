import { BackupSchema } from "../src/ts/offline/backup-schema";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

let runtimeErrors: string[];
let externalRequests: string[];
let failedResponses: string[];

test.beforeEach(async ({ context, baseURL }) => {
  runtimeErrors = [];
  externalRequests = [];
  failedResponses = [];
  context.on("page", (page) => {
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
  });
  context.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(response.url());
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== new URL(baseURL as string).origin) {
      externalRequests.push(url);
      await route.abort();
    } else {
      await route.continue();
    }
  });
});

test.afterEach(() => {
  expect(runtimeErrors, "uncaught browser errors").toEqual([]);
  expect(externalRequests, "external requests").toEqual([]);
  expect(failedResponses, "failed static resources").toEqual([]);
});

async function typeTenWords(page: Page): Promise<void> {
  await expect(page.locator("#words .word").first()).toBeVisible();
  await page
    .locator("[data-ui-element=testConfig] button")
    .filter({ hasText: /^words$/ })
    .click();
  await page
    .locator("[data-ui-element=testConfig] button")
    .filter({ hasText: /^10$/ })
    .click();
  await expect(page.locator("#words .word")).toHaveCount(10);
  // Let the official restart transition finish before reading its wordset.
  await page.waitForTimeout(700);
  const words = await page.locator("#words .word").allTextContents();
  await page.locator("#words").click({ position: { x: 10, y: 10 } });
  await page.keyboard.type(words.join(" "), { delay: 110 });
  await page.keyboard.press("Space");
  await expect(page.locator("#result .wpm .bottom")).toBeVisible();
  await expect(page.locator("#result .acc .bottom")).toHaveText("100%");
}

async function history(page: Page): Promise<void> {
  await page.locator("a[data-nav-item=account]").click();
  await expect(
    page.getByRole("heading", { name: "Local history" }),
  ).toBeVisible();
}

test("typing, reload, backup, delete, restore and invalid import without external requests", async ({
  page,
  context,
  baseURL,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== new URL(baseURL as string).origin) {
      external.push(url);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto("./");
  await typeTenWords(page);
  await expect(page.locator("#result")).not.toContainText("Sign in");
  await history(page);
  await expect(page.locator("#resultList tbody tr")).toHaveCount(1);

  const otherTab = await context.newPage();
  await otherTab.goto("./#/account");
  await expect(otherTab.locator("#resultList tbody tr")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("NaN");
  await page.reload();
  await expect(page.locator("#resultList tbody tr")).toHaveCount(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "export JSON" }).click();
  const download = await downloadPromise;
  const backup = await readFile(await download.path(), "utf8");
  const parsed = BackupSchema.parse(JSON.parse(backup) as unknown);
  expect(parsed.results).toHaveLength(1);
  expect(parsed.results[0]?.isPb).toBe(true);
  expect(parsed.results[0]).not.toHaveProperty("uid");
  expect(parsed.preferences?.config).toBeDefined();

  const file = {
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  };
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole("status")).toContainText(
    "Imported 0 new results; skipped 1",
  );
  await expect(page.locator("#resultList tbody tr")).toHaveCount(1);

  await page
    .getByRole("button", { name: "Delete saved result", exact: true })
    .click();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await expect(page.locator("#resultList tbody tr")).toHaveCount(0);
  await expect(otherTab.locator("#resultList tbody tr")).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole("status")).toContainText(
    "Imported 1 new results",
  );
  await expect(page.locator("#resultList tbody tr")).toHaveCount(1);
  await expect(otherTab.locator("#resultList tbody tr")).toHaveCount(1);

  const invalid = {
    ...parsed,
    results: [{ ...parsed.results[0], wpm: "broken" }],
  };
  await page
    .locator('input[type="file"]')
    .setInputFiles({ ...file, buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.getByRole("status")).toContainText("Expected number");
  await expect(page.locator("#resultList tbody tr")).toHaveCount(1);
  await page.locator("a[data-nav-item=test]").click();
  await typeTenWords(page);
  await history(page);
  await expect(page.locator("#resultList tbody tr")).toHaveCount(2);
  await expect(otherTab.locator("#resultList tbody tr")).toHaveCount(2);
  await expect(page.locator("#pageAccount canvas").first()).toBeVisible();
  await expect(page.locator("#pageAccount")).not.toContainText("NaN");
  await expect(page.locator("#pageAccount")).not.toContainText(
    "Complete more tests to see your speed trend.",
  );
  await page.getByRole("button", { name: "advanced", exact: true }).click();
  await page
    .getByRole("button", { name: "clear filters", exact: true })
    .click();
  await expect(page.locator("#resultList tbody tr")).toHaveCount(0);
  await page
    .locator("#pageAccount")
    .getByRole("button", { name: "all", exact: true })
    .click();
  await expect(page.locator("#resultList tbody tr")).toHaveCount(2);
  await page.locator("a[data-nav-item=settings]").click();
  await expect(page.locator("body")).toContainText("result saving");
  await page.reload();
  await expect(page.locator("body")).toContainText("result saving");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(failures).toEqual([]);
});

for (const mode of ["time", "quote", "zen", "custom"] as const) {
  test(`${mode} mode completes with the official result view`, async ({
    page,
  }) => {
    await page.goto("./");
    if (mode === "time") {
      await expect
        .poll(async () =>
          page.locator("#wordsWrapper").evaluate((element) => {
            const word = element.querySelector<HTMLElement>(".word");
            if (!word) return 0;
            const style = getComputedStyle(word);
            const lineHeight =
              word.offsetHeight +
              parseFloat(style.marginTop) +
              parseFloat(style.marginBottom);
            return Math.round(
              element.getBoundingClientRect().height / lineHeight,
            );
          }),
        )
        .toBe(3);
    }
    const config = page.locator("[data-ui-element=testConfig] button");
    await config.filter({ hasText: new RegExp(`^${mode}$`) }).click();
    if (mode === "time") await config.filter({ hasText: /^15$/ }).click();
    if (mode === "quote") await config.filter({ hasText: /^short$/ }).click();
    if (mode === "custom") {
      await config.filter({ hasText: /^change$/ }).click();
      await page.waitForTimeout(700);
      await page
        .getByPlaceholder("type or paste your custom text")
        .fill("local practice keeps every result inside this browser for you");
      await expect(
        page.getByPlaceholder("type or paste your custom text"),
      ).toHaveValue(
        "local practice keeps every result inside this browser for you",
      );
      await page.getByRole("button", { name: "ok", exact: true }).click();
      await expect(page.locator("#words .word").first()).toHaveText("local");
    }
    await page.waitForTimeout(700);
    await page.locator("#words").click({ position: { x: 10, y: 10 } });
    if (mode === "zen") {
      await page.keyboard.type(
        "local practice keeps every result inside this browser for you ",
        { delay: 280 },
      );
      await page.keyboard.press("Shift+Enter");
    } else if (mode === "time") {
      const started = Date.now();
      const words = await page.locator("#words .word").allTextContents();
      for (const word of words) {
        if (Date.now() - started >= 13_000) break;
        await page.keyboard.type(`${word} `, { delay: 90 });
      }
    } else {
      const words = await page.locator("#words .word").allTextContents();
      await page.keyboard.type(words.join(" "), { delay: 110 });
      await page.keyboard.press("Space");
    }
    await expect(page.locator("#result .wpm .bottom")).toBeVisible();
    await expect(page.locator("#result .acc .bottom")).toHaveText("100%");
    await history(page);
    await expect(page.locator("#resultList tbody tr")).toHaveCount(1);
    if (mode === "time") {
      await page.getByRole("button", { name: /time personal bests$/ }).click();
      await expect(page.locator("#pbTables")).toBeVisible();
      await expect(page.locator("#pbTables")).toContainText("english");
    }
  });
}

test("local language, theme, font and sound assets survive settings reload", async ({
  page,
}) => {
  const resources: string[] = [];
  page.on("response", (response) => resources.push(response.url()));
  await page.goto("./");
  await page.locator("a[data-nav-item=settings]").click();
  await page.locator('a[href="#group_theme"]').click();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.getByRole("button", { name: /chaos theory$/ }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const settings = JSON.parse(
          localStorage.getItem("monkeytype-local-config") ?? "{}",
        ) as Record<string, unknown>;
        return settings.theme;
      }),
    )
    .toBe("chaos_theory");
  // Exercise persisted official settings through the normal startup loader.
  await page.evaluate(() => {
    const settings = JSON.parse(
      localStorage.getItem("monkeytype-local-config") ?? "{}",
    ) as Record<string, unknown>;
    settings.language = "german";
    settings.playSoundOnClick = "1";
    settings.playSoundOnError = "1";
    settings.fontFamily = "Fira_Code";
    localStorage.setItem("monkeytype-local-config", JSON.stringify(settings));
  });
  await page.locator("a[data-nav-item=test]").click();
  await page.reload();
  await typeTenWords(page);
  await expect
    .poll(() => resources.some((url) => url.includes("/languages/german.json")))
    .toBe(true);
  await expect
    .poll(() =>
      resources.some((url) => url.includes("/themes/chaos_theory.css")),
    )
    .toBe(true);
  await expect
    .poll(() => resources.some((url) => url.includes("/sounds/click1/")))
    .toBe(true);
  await expect
    .poll(() => resources.some((url) => /fira.*\.woff2/i.test(url)))
    .toBe(true);
  await expect
    .poll(() =>
      resources.some((url) =>
        url.includes("/images/themes/chaos_theory/caret.webp"),
      ),
    )
    .toBe(true);
  await history(page);
  await expect(
    page.locator('#resultList tbody tr [aria-label="german"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: /word personal bests$/ }).click();
  await expect(page.locator("#pbTables")).toContainText("german");
});

test("practice remains available when IndexedDB is unavailable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, "open", {
      value() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
  });
  await page.goto("./");
  await expect(page.locator("#words .word").first()).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Local results storage is unavailable",
  );
  await typeTenWords(page);
  await expect(page.locator("#retrySavingResultButton")).toBeVisible();
  expect(errors).toEqual([]);
});
