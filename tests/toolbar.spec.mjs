import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

test("the toolbar can be hidden and shown again, and stays that way", async ({ page }) => {
  await openApp(page);
  await page.locator("#bHideBar").click();
  await expect(page.locator("#bar")).toBeHidden();
  await expect(page.locator("#bShowBar")).toBeVisible();
  // remembered for next time
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cak3d-cfg")).barOff)).toBe(true);
  await page.locator("#bShowBar").click();
  await expect(page.locator("#bar")).toBeVisible();
  await expect(page.locator("#bShowBar")).toBeHidden();
  await page.locator("#page").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("h");
  await expect(page.locator("#bar")).toBeHidden();
  await page.keyboard.press("h");
  await expect(page.locator("#bar")).toBeVisible();
});
