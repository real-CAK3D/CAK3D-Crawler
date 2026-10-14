import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openApp, crawlDone, tool } from "./helpers.mjs";

// one crawl, shared by every check in this file
test.describe.configure({ mode: "serial" });
let page;
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  await openApp(page);
  await crawlDone(page);
});
test.afterAll(() => page.context().close());

const tab = name => page.locator('#wvTabs [role="tab"]', { hasText: name });

test("web view: graph works from the keyboard", async () => {
  await page.locator("#bWeb").click();
  await expect(page.locator("#wv")).toBeVisible();
  await tab("Nest").click();
  await page.locator("#wvCanvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#announce")).toContainText(/In \d+ sentences?/);
  const first = await page.locator("#announce").textContent();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#announce")).not.toHaveText(first);
  await expect(page.locator("#wvSide")).not.toBeEmpty();
});

test("web view: list view lists every topic", async () => {
  await page.locator("#wvCanvas").focus();
  await page.keyboard.press("l");
  await expect(page.locator("#gList")).toBeVisible();
  await expect(page.locator("#gList button[data-key]").first()).toBeFocused();
  expect(await page.locator("#gList button[data-key]").count()).toBeGreaterThan(10);
  await page.locator("#gListBtn").click();
  await expect(page.locator("#gList")).toBeHidden();
});

test("tabs move with the arrow keys", async () => {
  await tab("Nest").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Graph")).toHaveAttribute("aria-selected", "true");
  await expect(tab("Graph")).toBeFocused();
});

test("study session schedules cards", async () => {
  await tab("Flashcards").click();
  await expect(page.locator("#pCards")).toContainText("new");
  await page.locator('#pCards [data-fc="flip"]').click();
  const good = page.locator("#pCards [data-grade]").nth(2);
  await expect(good).toBeVisible();
  await good.click();
  await expect(page.locator("#pCards")).toContainText("1 learned");
});

test("BibTeX and Zotero exports download", async () => {
  for (const [id, ext] of [["#exBib", ".bib"], ["#exRis", ".ris"]]) {
    const dl = page.waitForEvent("download");
    await page.locator(id).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(new RegExp(ext.replace(".", "\.") + "$"));
    const text = await (await file.createReadStream()).toArray().then(b => Buffer.concat(b).toString());
    expect(text).toContain(ext === ".bib" ? "@" : "TY  -");
  }
});

test("share as a web page downloads a standalone file", async () => {
  const dl = page.waitForEvent("download");
  await page.locator("#exShare").click();
  expect((await dl).suggestedFilename()).toMatch(/\.html$/);
  await page.locator("#wvClose").click();
});

test("Ask without an AI shows cited passages", async () => {
  await tool(page, "bAsk");
  await page.locator("#askQ").fill("What do spiders eat?");
  await page.locator("#askGo").click();
  await expect(page.locator("#askPassages li").first()).toBeVisible();
  await expect(page.locator("#askPassages .loc").first()).toContainText("[1]");
});

test("notes can be added to a passage", async () => {
  await page.locator("#askPassages [data-note-s]").first().click();
  await expect(page.locator("#dNote")).toBeVisible();
  await page.locator("#noteText").fill("Check this against the field guide.");
  await page.locator('#dNote button[type="submit"], #dNote button[value="save"]').first().click();
  await expect(page.locator("#dNote")).toBeHidden();
  await expect(page.locator("#dAsk")).toContainText("Check this against the field guide.");
  await page.locator("#askClose").click();
});

test("citation style changes the bibliography", async () => {
  await page.locator("#bSettings").click();
  await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#cfgCiteStyle").selectOption("mla");
  await page.keyboard.press("Escape");
  await tool(page, "bFind");
  await page.locator('#findTabs [data-ft="sources"]').click();
  await expect(page.locator("#srcInfoList")).toContainText(/Wikipedia/);
  const mla = await page.locator("#srcInfoList").textContent();
  await page.locator("#bSettings").click();
  await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#cfgCiteStyle").selectOption("apa");
  await page.keyboard.press("Escape");
  await expect(page.locator("#srcInfoList")).not.toHaveText(mla);
  await page.locator("#findClose").click();
});

test("no serious accessibility problems", async () => {
  const views = [["main page", async () => {}], ["web view", async () => { await page.locator("#bWeb").click(); }],
    ["list view", async () => { await tab("Nest").click(); await page.locator("#gListBtn").click(); }]];
  for (const [name, open] of views) {
    await open();
    const r = await new AxeBuilder({ page }).analyze();
    const bad = r.violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => `${name}: ${v.id} (${v.nodes.length}) e.g. ${v.nodes[0].target.join(" ")}: ${(v.nodes[0].any[0] || {}).message || ""}`);
    expect(bad).toEqual([]);
  }
});
