import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

// the same build with the paid-pack locks switched on, as the Play release and website will be
async function lockedApp(page) {
  await page.route("**/config.js", route => route.fulfill({ contentType: "text/javascript", body: 'window.CRAWLER_CONFIG = { ai: {}, vendor: "vendor/", lockPaid: true, playUrl: "" };' }));
  await openApp(page, { look: "realistic", type: "huntsman" });
}

test("while in development every pack is unlocked", async ({ page }) => {
  await openApp(page);
  await page.locator("#bSettings").click();
  await page.locator("#cfgLook").selectOption("hero");
  await expect(page.locator("#cfgLook")).toHaveValue("hero");
  await expect(page.locator('#cfgLook option[value="hero"]')).toHaveText(/✦$/);
});

test("locked packs open the store and keep the free choice", async ({ page }) => {
  await lockedApp(page);
  await page.locator("#bSettings").click();
  // saved paid choices fall back to free ones
  await expect(page.locator("#cfgLook")).toHaveValue("classic");
  await expect(page.locator("#cfgType")).toHaveValue("cobweb");
  await expect(page.locator('#cfgLook option[value="realistic"]')).toHaveText(/🔒$/);
  await page.locator("#cfgLook").selectOption("realistic");
  await expect(page.locator("#dStore")).toBeVisible();
  await expect(page.locator("#storeList .pack.focus h3")).toHaveText("Spider looks");
  await expect(page.locator("#storeList .pack.focus")).toContainText("In the Android app");
  await page.locator("#storeClose").click();
  await expect(page.locator("#cfgLook")).toHaveValue("classic");
  // free options still work
  await page.locator("#cfgLook").selectOption("cartoon");
  await expect(page.locator("#cfgLook")).toHaveValue("cartoon");
});

test("flies and the new spiders run without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await openApp(page, { flies: 5, look: "realistic", type: "trapdoor", tint: "hero" });
  for (const [look, type] of [["hero", "huntsman"], ["crystal", "cellar"], ["skeleton", "widow"]]) {
    await page.locator("#bSettings").click();
    await page.locator("#cfgLook").selectOption(look);
    await page.locator("#cfgType").selectOption(type);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
  }
  expect(errors).toEqual([]);
});
