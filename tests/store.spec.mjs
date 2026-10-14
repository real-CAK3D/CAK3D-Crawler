import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

// the same build with the store's locks switched on, as the Play release will be; `owned` fakes purchases
async function lockedApp(page, cfg = {}, owned = []) {
  await page.route("**/config.js", route => route.fulfill({ contentType: "text/javascript", body: 'window.CRAWLER_CONFIG = { ai: {}, vendor: "vendor/", lockPaid: true, playUrl: "" };' }));
  await page.addInitScript(o => localStorage.setItem("cak3d-owned", JSON.stringify(o)), owned);
  await openApp(page, cfg);
  await page.locator("#bSettings").click();
}

test("while in development every item is unlocked", async ({ page }) => {
  await openApp(page);
  await page.locator("#bSettings").click();
  await page.locator("#cfgLook").selectOption("flyer");
  await expect(page.locator("#cfgLook")).toHaveValue("flyer");
  await expect(page.locator('#cfgLook option[value="flyer"]')).toHaveText(/✦$/);
});

test("the free defaults, and prices on everything else", async ({ page }) => {
  await lockedApp(page, { look: "realistic", type: "huntsman", flies: 3, bored: "both", speed: 4 });
  // saved paid choices fall back to the free defaults
  await expect(page.locator("#cfgLook")).toHaveValue("classic");
  await expect(page.locator("#cfgType")).toHaveValue("cobweb");
  await expect(page.locator("#cfgFlies")).toHaveValue("0");
  await expect(page.locator("#cfgSpeed")).toHaveValue("1");
  await expect(page.locator('#setTabs [data-g="moves"]')).toBeVisible();
  await expect(page.locator('#cfgLook option[value="classic"]')).toHaveText("Classic silhouette");
  await expect(page.locator('#cfgLook option[value="cartoon"]')).toHaveText(/🔒 \$0\.99$/);
  await expect(page.locator('#cfgLook option[value="realistic"]')).toHaveText(/🔒 \$1\.99$/);
  await expect(page.locator('#cfgLook option[value="herork"]')).toHaveText(/🔒 \$1\.99$/);
  await expect(page.locator('#cfgSpeed option[value="4"]')).toHaveText(/🔒 \$0\.99$/);
  await expect(page.locator('#cfgSpeed option[value="0.5"]')).not.toHaveText(/🔒/);
  await expect(page.locator('#cfgAmbient option[value="rain"]')).not.toHaveText(/🔒/); // dust, rain and leaves are free
  await expect(page.locator('#cfgAmbient option[value="snow"]')).toHaveText(/🔒 \$0\.99$/);
  await expect(page.locator('#cfgSkin option[value="contrast"]')).not.toHaveText(/🔒/); // high contrast stays free
  await expect(page.locator('#cfgEntrance option[value="balloon"]')).not.toHaveText(/🔒/); // entrances are free
  // picking a locked item opens the store at that item and keeps the free choice
  await page.locator("#cfgLook").selectOption("skeleton");
  await expect(page.locator("#storePage")).toBeVisible();
  await expect(page.locator("#stSheetH")).toHaveText("Skeleton");
  await expect(page.locator("#stSheet")).toContainText("$1.99");
  await expect(page.locator('#stTabs [aria-selected="true"]')).toHaveText("Premium looks");
  // Escape closes the item, then Back returns to Settings
  await page.keyboard.press("Escape");
  await expect(page.locator("#stSheet")).toBeHidden();
  await page.locator("#stBack").click();
  await expect(page.locator("#storePage")).toBeHidden();
  await expect(page.locator("#dSettings")).toBeVisible();
  await expect(page.locator("#cfgLook")).toHaveValue("classic");
});

test("the store lists bundles, presets and every item", async ({ page }) => {
  await lockedApp(page);
  // the Store button in Settings opens the store page
  await page.locator("#bStore").click();
  await expect(page.locator("#storePage")).toBeVisible();
  await expect(page.locator("#dSettings")).toBeHidden();
  await expect(page.locator("#stTabs button")).toContainText(["Featured", "Bundles", "Presets", "Spider kinds", "Spider looks", "Premium looks", "Colors"]);
  await expect(page.locator(".st-hero")).toContainText("$19.99");
  await page.locator('#stTabs [data-cat="bundles"]').click();
  for (const [name, price] of [["Starter bundle", "$4.99"], ["Collector bundle", "$9.99"], ["Deluxe bundle", "$14.99"], ["Everything", "$19.99"]])
    await expect(page.locator(".st-card", { hasText: name })).toContainText(price);
  await page.locator('#stTabs [data-cat="presets"]').click();
  await expect(page.locator(".st-card", { hasText: "Spooky night preset" })).toContainText("$1.99");
  // a bundle's detail lists what it includes
  await page.locator('#stTabs [data-cat="bundles"]').click();
  await expect(async () => {
    await page.locator(".st-card", { hasText: "Starter bundle" }).click();
    await expect(page.locator("#stSheet .st-inc")).toContainText("Spider kinds", { timeout: 3000 });
  }).toPass();
});

test("bundles, presets and single items unlock what they should", async ({ page }) => {
  await lockedApp(page, {}, ["bundle_starter", "preset_spooky", "look_hero_yellow"]);
  // the Starter bundle: kinds, colors, flies, speed
  await expect(page.locator('#cfgType option[value="widow"]')).toHaveText(/✦$/);
  await expect(page.locator('#cfgTint option[value="rainbow"]')).toHaveText(/✦$/);
  await expect(page.locator('#cfgSpeed option[value="4"]')).toHaveText(/✦$/);
  // but not the looks, which come with the Collector bundle
  await expect(page.locator('#cfgLook option[value="robot"]')).toHaveText(/🔒/);
  // the Spooky night preset unlocks the items it uses: the ghost look and the spooky theme
  await expect(page.locator('#cfgLook option[value="ghost"]')).toHaveText(/✦$/);
  await expect(page.locator('#cfgSkin option[value="spooky"]')).toHaveText(/✦$/);
  // a single item
  await page.locator("#cfgLook").selectOption("heroyb");
  await expect(page.locator("#cfgLook")).toHaveValue("heroyb");
  // flies were in the bundle: up to 6
  await page.locator("#cfgFlies").fill("6");
  await expect(page.locator("#cfgFlies")).toHaveValue("6");
});

test("flies, presets and the new suits run without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await openApp(page, { flies: 6, look: "flyer", type: "wolf" });
  for (const [look, type] of [["hero", "huntsman"], ["heroyb", "cellar"], ["herork", "widow"], ["flyer", "jumping"]]) {
    await page.locator("#bSettings").click();
    await page.locator("#cfgLook").selectOption(look);
    await page.locator("#cfgType").selectOption(type);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  }
  expect(errors).toEqual([]);
});

test("every item in the store has a picture of what it gives", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await lockedApp(page);
  await page.locator("#bStore").click();
  // walk every section; each product shows up once outside Featured
  const seen = new Set(), blank = [];
  for (const cat of await page.locator("#stTabs button").evaluateAll(bs => bs.map(b => b.dataset.cat).filter(c => c !== "featured"))) {
    await page.locator(`#stTabs [data-cat="${cat}"]`).click();
    const res = await page.locator("#stBody canvas[data-thumb]").evaluateAll(cvs => cvs.map(cv => {
      const g = cv.getContext("2d"), d = g.getImageData(0, 0, cv.width, cv.height).data, first = d.slice(0, 4).join();
      let empty = true; for (let i = 0; i < d.length; i += 16) if (d.slice(i, i + 4).join() !== first) { empty = false; break; }
      return [cv.dataset.thumb, empty];
    }));
    for (const [id, empty] of res) { seen.add(id); if (empty) blank.push(id); }
  }
  expect(seen.size).toBe(110);
  expect(blank).toEqual([]);
  expect(errors).toEqual([]);
});
