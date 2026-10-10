import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openApp, crawlDone } from "./helpers.mjs";

test("the stats panel shows every decision live", async ({ page }) => {
  await openApp(page, { flies: 3 });
  await page.keyboard.press("s");
  await expect(page.locator("#statsPanel")).toBeVisible();
  await expect(page.locator("#bStats")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#spMode")).toContainText("Discovery crawl");
  await expect(page.locator("#spStream tr td").nth(3)).toContainText(/^p \d\.\d{3}$/);
  await crawlDone(page);
  const total = await page.locator("#sTotal").textContent();
  await expect(page.locator("#spRouted")).toHaveText(total);
  // the three routes add up to every decision
  const nums = await page.locator("#spBars .sp-bar span:last-child").allTextContents();
  expect(nums.map(Number).reduce((a, b) => a + b, 0)).toBe(+total);
  await expect(page.locator("#spCov")).toContainText("% of sentences covered");
  // with no AI set up, close calls and unsure keywords come to you
  const keep = page.locator("#spReview [data-keep]").first();
  if (await keep.count()) { const before = await page.locator("#spWho").textContent(); await keep.click(); await expect(page.locator("#spWho")).not.toHaveText(before); }
  const r = await new AxeBuilder({ page }).include("#statsPanel").analyze();
  expect(r.violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => v.id)).toEqual([]);
});

test("a focused crawl asks about the focus", async ({ page }) => {
  await openApp(page);
  await page.locator("#focus").fill("venom");
  await page.locator("#bStats").click();
  await expect(page.locator("#spMode")).toContainText("looking for “venom”");
  await expect(page.locator("#spStream")).toContainText("relevant to focus?", { timeout: 60_000 });
});
