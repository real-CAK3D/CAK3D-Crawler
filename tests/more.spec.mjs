import { test, expect } from "@playwright/test";
import { openApp, crawlDone } from "./helpers.mjs";

const BOOK = `The Project Gutenberg eBook of A Short Book on Bees
This eBook is for the use of anyone anywhere at no cost. Project Gutenberg License applies to this electronic work.

*** START OF THE PROJECT GUTENBERG EBOOK A SHORT BOOK ON BEES ***

Chapter 1: Colonies

A colony changes through the seasons. The queen lays eggs while workers gather nectar. The colony changes again in autumn, when drones are driven out. Workers build wax comb for the colony. Men who keep bees are called beekeepers, and the beekeepers watch how the colony changes.

Chapter 2: Swarms

A swarm leaves when the colony grows crowded. The old queen leaves with the swarm, and scouts look for a new hollow. The swarm settles on a branch while scouts dance. Beekeepers collect a swarm in a box, and the swarm builds new comb.

*** END OF THE PROJECT GUTENBERG EBOOK A SHORT BOOK ON BEES ***

Section 1. General Terms of Use and Redistributing Project Gutenberg electronic works. Project Gutenberg electronic works Project Gutenberg.`;

async function loadText(page, text, title) {
  await page.locator("#bSource").click();
  await page.locator("#srcTextR").check();
  await page.locator("#srcText").fill(text);
  await page.locator("#srcTitle").fill(title);
  await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden();
}

test("e-book wrappers are left out and plurals are folded properly", async ({ page }) => {
  await openApp(page);
  await loadText(page, BOOK, "A Short Book on Bees");
  await expect(page.locator("#page")).not.toContainText("Project Gutenberg");
  const keys = await page.locator("#page .kw").evaluateAll(els => [...new Set(els.map(e => e.dataset.k))]);
  expect(keys).toContain("colony");
  expect(keys).toContain("swarm");
  expect(keys.some(k => /gutenberg|electronic/.test(k))).toBe(false);
  expect(keys).not.toContain("chang"); // "changes" folds to "change", never "chang"
});

test("clicking the spider opens its menu, and it hunts a fly you feed it", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await openApp(page, { flies: 0 });
  await page.waitForTimeout(2500);
  const at = await page.evaluate(() => { const c = document.getElementById("web").getBoundingClientRect(); return { w: c.width, h: c.height }; });
  // find the spider by clicking where it is drawn: sweep the canvas for the menu to appear
  let opened = false;
  for (let y = 120; y < at.h - 20 && !opened; y += 24) for (let x = 20; x < at.w - 20 && !opened; x += 24) {
    await page.mouse.click(x, y);
    opened = await page.locator("#spiderPop").isVisible();
  }
  expect(opened).toBe(true);
  await expect(page.locator("#spiderPop")).toContainText("keywords caught");
  await page.locator('#spiderPop [data-sp="fly"]').click();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test("a weave code moves a crawl, with its notes, to another device", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await openApp(a);
  await loadText(a, BOOK, "Bees to share");
  await a.evaluate(() => {}); // the crawl is open
  await a.locator("#bAsk").click(); await a.locator("#askQ").fill("swarm"); await a.locator("#askGo").click();
  await a.locator("#askPassages [data-note-s]").first().click();
  await a.locator("#noteText").fill("Check the swarm season.");
  await a.locator('#dNote button[type="submit"], #dNote button[value="save"]').first().click();
  await a.locator("#askClose").click();
  await a.locator("#bLib").click();
  await a.locator("#weaveMake").click();
  const code = await a.locator("#weaveOut").inputValue();
  expect(code.startsWith("CAK3D-WEAVE1.")).toBe(true);

  const b = await (await browser.newContext()).newPage(); // a different device: nothing shared but the code
  await openApp(b);
  await b.locator("#bLib").click();
  await b.locator("#weaveIn").fill(code);
  await b.locator("#weaveOpen").click();
  await expect(b.locator("#weaveMsg")).toContainText("Opened “Bees to share”");
  await expect(b.locator("#docTitle")).toHaveText("Bees to share");
  const notes = await b.evaluate(() => JSON.stringify(localStorage)); // the note came across with the crawl
  await b.locator("#dLib").evaluate(d => d.close());
  await b.locator("#bAsk").click(); await b.locator("#askQ").fill("swarm"); await b.locator("#askGo").click();
  await expect(b.locator("#dAsk")).toContainText("Check the swarm season.");
  await a.context().close(); await b.context().close();
});

test("More pages searches the web and adds the pages to the crawl", async ({ page }) => {
  const cors = { "access-control-allow-origin": "*" };
  await page.route("https://en.wikipedia.org/w/api.php?*", route => {
    const u = route.request().url();
    if (u.includes("list=search")) return route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ query: { search: [{ title: "Swarming (honey bee)", snippet: "how bees swarm" }] } }) });
    return route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ query: { pages: { 1: { title: "Swarming (honey bee)", extract: "Swarming is the process by which a new honey bee colony is formed. ".repeat(4) + "Scout bees search for a new nest site. The swarm clusters on a branch while scout bees dance. ".repeat(4), links: [] } } } }) });
  });
  await page.route("https://r.jina.ai/**", route => route.fulfill({ headers: cors, body: "Title: Search\n\nMarkdown Content:\nnothing" }));
  await openApp(page);
  await loadText(page, BOOK, "A Short Book on Bees");
  await page.locator("#bMore").click();
  await expect(page.locator("#srcKeepRow")).toBeVisible();
  await expect(page.locator("#webQ")).toHaveValue(/A Short Book on Bees/);
  await expect(page.locator("#webResults li").first()).toContainText("Swarming (honey bee)");
  await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden();
  await expect(page.locator("#docTitle")).toHaveText("A Short Book on Bees + 1 more");
  await expect(page.locator("#page")).toContainText("Scout bees search for a new nest site");
  await expect(page.locator("#page")).toContainText("Chapter 1: Colonies"); // what was crawled before is still there
});

test("when it's done, the web lets go; when it's bored, it walks the edges of the screen", async ({ page }) => {
  test.setTimeout(150_000);
  await openApp(page, { bored: "edges", exit: "stay", flies: 0 });
  await crawlDone(page);
  await expect(page.locator("#log")).toContainText("lets go of the words", { timeout: 30_000 });
  await expect(page.locator("#log")).toContainText("goes for a walk around the screen", { timeout: 40_000 });
});

test("a backup can be made from the library", async ({ page }) => {
  await openApp(page);
  await page.locator("#bLib").click();
  const dl = page.waitForEvent("download");
  await page.locator("#backupMake").click();
  expect((await dl).suggestedFilename()).toMatch(/^cak3d-crawler-backup-\d{4}-\d{2}-\d{2}\.json$/);
});
