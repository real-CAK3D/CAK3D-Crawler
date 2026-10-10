import { test, expect } from "@playwright/test";
import { openApp, crawlDone } from "./helpers.mjs";

// after sitting still, the spider spins a web in a top corner of the screen and waits in it
test("the spider builds a web in the screen corner", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await openApp(page, { flies: 3, exit: "stay" });
  await crawlDone(page);
  await expect(page.locator("#log")).toContainText(/spinning a web in the top (left|right) corner of the screen/, { timeout: 40_000 });
  await expect(page.locator("#log")).toContainText("The web is done", { timeout: 90_000 });
  // scrolling doesn't knock it out of its corner
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});
