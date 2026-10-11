import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

// on a phone nothing should cover the text, the graph or the flashcards
test.skip(({ isMobile }) => !isMobile, "phone only");
test("phone layout leaves room for the content", async ({ page }) => {
  await openApp(page);
  const vh = page.viewportSize().height;
  const bar = await page.locator("#bar").boundingBox();
  expect(bar.height).toBeLessThan(vh * 0.25);
  // the web view's tools fold away, so the flashcard and its button are on screen
  await page.locator("#bWeb").click();
  await page.locator('#wvTabs [data-tab="cards"]').click();
  await expect(page.locator("#wvMore")).not.toHaveAttribute("open", "");
  const btn = await page.locator('#pCards [data-fc="flip"]').boundingBox();
  expect(btn.y + btn.height).toBeLessThan(vh);
  // and they're one tap away
  await page.locator("#wvMore > summary").click();
  await expect(page.locator("#exBib")).toBeVisible();
  await page.locator("#wvClose").click();
  // the stats panel stays within the screen width
  await page.locator("#bStats").click();
  const sp = await page.locator("#statsPanel").boundingBox();
  expect(sp.height).toBeLessThan(vh * 0.6);
  expect(await page.evaluate(() => document.getElementById("statsPanel").scrollWidth <= innerWidth + 1)).toBe(true);
});
