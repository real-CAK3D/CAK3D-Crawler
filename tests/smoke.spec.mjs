import { test, expect } from "@playwright/test";
import { openApp, crawlDone } from "./helpers.mjs";

test("the sample crawl finishes and fills the log", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await openApp(page);
  await crawlDone(page);
  expect(await page.locator("#log li:not(.empty)").count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
