// Opens the built app (www/) in a real browser and checks the main features.
// Run `npm run build` first, then `npm test`.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /smoke|corner|phone/ }
  ],
  webServer: { command: "npx http-server www -p 4173 -a 127.0.0.1 -c-1 -s", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI }
});
