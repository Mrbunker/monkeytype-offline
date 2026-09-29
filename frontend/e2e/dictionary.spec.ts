import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { BackupSchema } from "../src/ts/offline/backup-schema";
import { LocalResultSchema } from "../src/ts/offline/results";

test.beforeEach(async ({ context, baseURL }) => {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    expect(
      new URL(url).origin,
      "dictionary must stay on the static origin",
    ).toBe(new URL(baseURL as string).origin);
    await route.continue();
  });
});

async function open(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Dictionary / 查词" }).click();
  await expect(page.locator("#DictionaryModal")).toBeVisible();
}
async function search(page: Page, word: string): Promise<void> {
  await page.getByRole("textbox", { name: "查询英文单词" }).fill(word);
  await page.getByRole("button", { name: "查询", exact: true }).click();
}

test("legacy database upgrade, lookup, favorites, backup merge and custom practice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const legacyResult = LocalResultSchema.parse({
    _id: "00000000-0000-4000-8000-000000000001",
    wpm: 60,
    rawWpm: 65,
    charStats: [150, 0, 0, 0],
    acc: 95,
    mode: "time",
    mode2: "30",
    timestamp: 1000,
    testDuration: 30,
    consistency: 80,
    keyConsistency: 80,
    chartData: { wpm: [60], burst: [65], err: [0] },
  });
  await page.goto("robots.txt");
  await page.evaluate(async (result) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("monkeytype-local-practice", 1);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore("results", { keyPath: "_id" })
          .createIndex("timestamp", "timestamp");
      };
      request.onsuccess = () => {
        const transaction = request.result.transaction("results", "readwrite");
        transaction.objectStore("results").put(result);
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, legacyResult);
  await page.goto("./");
  const shards: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/dictionaries/")) shards.push(request.url());
  });
  await expect(page.locator("#words .word").first()).toBeVisible();
  expect(shards).toEqual([]);
  await open(page);
  await search(page, "Curious!");
  await expect(
    page.getByRole("heading", { name: "curious", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article", { name: "单词详情" })).toContainText(
    "好奇",
  );
  expect(shards.length).toBeLessThanOrEqual(3);
  await page.getByRole("button", { name: "收藏生词", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消收藏" })).toBeVisible();
  await page.reload();
  await open(page);
  await page.getByRole("button", { name: "生词本 (1)" }).click();
  await expect(page.getByRole("list", { name: "生词列表" })).toContainText(
    "curious",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.locator("a[data-nav-item=account]").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "export JSON" }).click();
  const download = await downloadPromise;
  const backup = await readFile(await download.path(), "utf8");
  const parsed = BackupSchema.parse(JSON.parse(backup) as unknown);
  expect(parsed.results[0]?._id).toBe(legacyResult._id);
  expect(parsed.vocabulary?.[0]?.word).toBe("curious");
  expect(parsed.version).toBe(2);
  await open(page);
  await page.getByRole("button", { name: "生词本 (1)" }).click();
  await page.getByRole("checkbox", { name: "选择 curious" }).check();
  await page.getByRole("button", { name: "移除选中" }).click();
  await expect(page.getByRole("button", { name: "生词本 (0)" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  const upload = page.getByLabel("Import local practice backup");
  await upload.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole("status")).toContainText("Backup restored.");
  await upload.setInputFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "monkeytype-local-practice",
        version: 1,
        exportedAt: 1,
        results: [],
      }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("Backup restored.");
  await open(page);
  await page.getByRole("button", { name: "生词本 (1)" }).click();
  await page.getByRole("checkbox", { name: "选择 curious" }).check();
  await page.getByRole("button", { name: "练习选中 (1)" }).click();
  await expect(page.locator("#DictionaryModal")).toBeHidden();
  await expect(page.locator("#words .word").first()).toHaveText("curious");
  await expect(page.locator("#words .word")).toHaveCount(10);
  expect(errors).toEqual([]);
});

test("lookup remains usable when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new Error("Storage disabled for test");
    };
  });
  await page.goto("./");
  await open(page);
  await search(page, "curious");
  await expect(
    page.getByRole("heading", { name: "curious", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#DictionaryModal").getByRole("alert"),
  ).toContainText("无法读取生词本");
  await expect(
    page.getByRole("button", { name: "收藏生词", exact: true }),
  ).toBeDisabled();
});

test("result lookup uses the target word and preserves scores and keyboard focus", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .locator("[data-ui-element=testConfig] button")
    .filter({ hasText: /^words$/ })
    .click();
  await page
    .locator("[data-ui-element=testConfig] button")
    .filter({ hasText: /^10$/ })
    .click();
  await expect(page.locator("#words .word")).toHaveCount(10);
  await page.waitForTimeout(700);
  const words = await page.locator("#words .word").allTextContents();
  await page.locator("#words").click({ position: { x: 10, y: 10 } });
  await page.keyboard.type("zzzz ", { delay: 100 });
  await expect(
    page.getByRole("button", { name: "Dictionary / 查词" }),
  ).toBeDisabled();
  await page.keyboard.type(`${words.slice(1).join(" ")} `, { delay: 100 });
  await expect(page.locator("#result .wpm .bottom")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dictionary / 查词" }),
  ).toBeEnabled();
  const speed = await page.locator("#result .wpm .bottom").textContent();
  await page.locator("#showWordHistoryButton").click();
  const first = page
    .locator("#resultWordsHistory [data-dictionary-word]")
    .first();
  await expect(first).toBeVisible();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#DictionaryModal")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: words[0], exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article", { name: "单词详情" })).toContainText(
    "zzzz",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#DictionaryModal")).toBeHidden();
  await expect(first).toBeFocused();
  await expect(page.locator("#result .wpm .bottom")).toHaveText(
    speed as string,
  );
});

test("mobile lookup handles empty results, download retry and stale searches", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  let failOnce = true;
  await page.route("**/dictionaries/en/cu.*.json", async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({ status: 503, body: "unavailable" });
    } else {
      await route.continue();
    }
  });
  await open(page);
  await search(page, "curious");
  await expect(page.getByRole("alert")).toContainText("词典加载失败");
  await page.getByRole("button", { name: "重试查询" }).click();
  await expect(
    page.getByRole("heading", { name: "curious", exact: true }),
  ).toBeVisible();
  await search(page, "zzzzzzzzzzzz");
  await expect(page.getByRole("status")).toContainText("未收录");
  await search(page, "went");
  await page.getByRole("button", { name: "原形：go", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "go", exact: true }),
  ).toBeVisible();
  await page.route("**/dictionaries/en/ab.*.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await search(page, "ability");
  await search(page, "curious");
  await expect(
    page.getByRole("heading", { name: "curious", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(
    page.getByRole("heading", { name: "curious", exact: true }),
  ).toBeVisible();
  const bounds = await page.locator("#DictionaryModal .modal").boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
});
