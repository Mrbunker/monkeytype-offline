import { defineConfig } from "@playwright/test";

const subpath = process.env.E2E_SUBPATH === "true";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL:
      process.env.E2E_BASE_URL ??
      `http://127.0.0.1:4173/${subpath ? "monkeytype-offline/" : ""}`,
    headless: true,
    actionTimeout: 10_000,
    viewport: { width: 1440, height: 1000 },
    launchOptions:
      process.env.CHROME_PATH === undefined
        ? {}
        : {
            executablePath: process.env.CHROME_PATH,
          },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `python3 -m http.server 4173 --bind 127.0.0.1 --directory ${subpath ? "dist-subpath" : "dist"}`,
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: process.env.CI !== "true",
  },
});
