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
  await page.locator("#page").click({ position: { x: 5, y: 5 }, force: true }); // the page may be following the spider
  await page.keyboard.press("h");
  await expect(page.locator("#bar")).toBeHidden();
  await page.keyboard.press("h");
  await expect(page.locator("#bar")).toBeVisible();
});

test("every toolbar button fits on one row, with no sideways scrolling", async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const bar = document.getElementById("tools"), btns = [...bar.querySelectorAll(".tb-btn")].map(b => b.getBoundingClientRect());
    return { tops: [...new Set(btns.map(b => Math.round(b.top)))], right: Math.max(...btns.map(b => b.right)), vw: innerWidth, scroll: document.documentElement.scrollWidth };
  });
  expect(r.tops.length).toBe(1);
  expect(r.right).toBeLessThanOrEqual(r.vw);
  expect(r.scroll).toBeLessThanOrEqual(r.vw + 1);
  // a menu opens, its items work, and Escape closes it
  await page.locator("#mbAsk").click();
  await expect(page.locator("#mAsk")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#mAsk")).toBeHidden();
  await page.locator("#mbAsk").click();
  await page.locator("#bAsk").click();
  await expect(page.locator("#dAsk")).toBeVisible();
});

test("help explains whatever you point at", async ({ page }) => {
  await openApp(page);
  await page.locator("#bHelp").click();
  await expect(page.locator("#helpWhat")).toContainText("Web view");
  await page.locator('#helpTabs [data-h="legend"]').click();
  await expect(page.locator("#helpLegend")).toContainText("Topics in this text");
  await page.locator("#helpPoint").click();
  await expect(page.locator("#xpBar")).toBeVisible();
  await page.locator("#bWeb").click();
  await expect(page.locator("#xpTitle")).toHaveText("Web view");
  await expect(page.locator("#wv")).toBeHidden(); // pointing doesn't press the button
  await page.locator("#page p .kw").first().click();
  await expect(page.locator("#xpTitle")).toHaveText(/^(Keyword|The spider)$/); // the spider may be standing on it
  await page.keyboard.press("Escape");
  await expect(page.locator("#xpBar")).toBeHidden();
});

test("Settings shows a support ID and a way to report an issue", async ({ page }) => {
  await openApp(page);
  await page.locator("#bSettings").click();
  await page.locator("#setHelp").click();
  await expect(page.locator("#supId")).toHaveText(/^AN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const id = await page.locator("#supId").textContent();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cak3d-id")))).toBe(id); // the same ID every time
  await page.locator("#bSettings").click();
  await page.locator("#setHelp").click();
  await page.locator("#repSend").click();
  await expect(page.locator("#repNote")).toHaveText("Write what went wrong first.");
  await expect(page.locator("#supLegal")).toContainText("CAK3D_Creations");
});
