// Uses every control in the app at least once, the way a person would, and fails on any error.
import { test, expect } from "@playwright/test";
import { openApp, crawlDone, tool } from "./helpers.mjs";

// like a phone, the browser lets the app use the clipboard
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const watch = page => {
  const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource|net::ERR|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push("console: " + m.text().slice(0, 200)); });
  page.on("dialog", d => d.accept()); // any confirm() the app asks
  return errs;
};
const settle = (page, ms = 250) => page.waitForTimeout(ms);
const closeAll = async page => { for (let i = 0; i < 3 && await page.locator("dialog[open]").count(); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(150); } };
const download = async (page, click) => { const [d] = await Promise.all([page.waitForEvent("download"), click()]); return d.suggestedFilename(); };

test("every setting, every value", async ({ page }) => {
  test.setTimeout(420_000);
  const errs = watch(page);
  await openApp(page, { flies: 2 });
  await page.locator("#bSettings").click();
  const panes = [["spider", "spider"], ["spider", "moves"], ["spider", "babies"], ["webfx", "web"], ["webfx", "fx"], ["theme", "theme"], ["research", "research"]];
  for (const [p, g] of panes) {
    await page.locator(`#setTabs .set-main [data-p="${p}"]`).click();
    if (p === "spider" || p === "webfx") await page.locator(`#setTabs .set-sub [data-g="${g}"]`).click();
    const sec = page.locator(`#dSettings section[data-g="${g}"]`);
    // every option of every dropdown
    for (const sel of await sec.locator("select").all()) {
      if (!(await sel.isVisible())) continue;
      const id = await sel.getAttribute("id");
      if (id === "aiService" || id === "ttsVoice") continue; // AI and voices have their own tests
      const values = await sel.locator("option").evaluateAll(os => os.filter(o => !o.disabled).map(o => o.value));
      const first = await sel.inputValue();
      for (const v of values) { await sel.selectOption(v); await settle(page, 60); }
      await sel.selectOption(first);
    }
    // every checkbox on and off
    for (const cb of await sec.locator('input[type="checkbox"]').all()) {
      if (!(await cb.isVisible())) continue;
      await cb.click(); await settle(page, 60); await cb.click(); await settle(page, 60);
    }
    // every slider at its smallest and largest
    for (const r of await sec.locator('input[type="range"]').all()) {
      if (!(await r.isVisible())) continue;
      const [min, max, val] = await r.evaluate(el => [el.min, el.max, el.value]);
      for (const v of [min, max, val]) { await r.fill(v); await settle(page, 60); }
    }
    // text fields take input
    for (const t of await sec.locator('input[type="text"]:not([readonly])').all()) {
      if (!(await t.isVisible()) || ["aiHost", "aiBase", "aiModel", "aiKey"].includes(await t.getAttribute("id"))) continue;
      const before = await t.inputValue(); await t.fill("Charlotte"); await t.fill(before);
    }
  }
  // every preset, and Surprise me
  const presets = await page.locator("#preset option").evaluateAll(os => os.map(o => o.value).filter(Boolean));
  for (const p of presets) { await page.locator("#preset").selectOption(p); await settle(page, 400); }
  for (let i = 0; i < 4; i++) { await page.locator("#surprise").click(); await settle(page, 300); }
  await page.locator("#preset").selectOption("classic");
  // let the spider run with the last settings for a while
  await page.locator("#setBack").click();
  await settle(page, 4000);
  expect(errs).toEqual([]);
});

test("the toolbar, menus and every keyboard shortcut", async ({ page }) => {
  const errs = watch(page);
  await openApp(page, { flies: 2 });
  await tool(page, "bPause"); await expect(page.locator("#bPause")).toContainText(/Resume/);
  await tool(page, "bPause"); await expect(page.locator("#bPause")).toContainText(/Pause/);
  await tool(page, "bFollow"); await tool(page, "bFollow");
  await tool(page, "bRestartTb"); await settle(page, 600);
  for (const k of [" ", " ", "f", "f", "s", "s", "t", "t", "t", "h", "h"]) { await page.locator("#page").press(k === " " ? "Space" : k); await settle(page, 200); }
  // shortcuts that open things, each closed with Escape
  for (const [k, sel] of [["w", "#wv"], ["a", "#dAsk"], ["/", "#findPanel"], ["c", "#findPanel"], ["g", "#dGuide"], ["l", "#dLib"], ["?", "#dHelp"], ["k", "#codePage"]]) {
    await page.locator("body").press(k); await expect(page.locator(sel)).toBeVisible();
    await page.keyboard.press("Escape"); await expect(page.locator(sel)).toBeHidden();
  }
  await page.locator("body").press("r"); await settle(page, 500);
  await page.locator("#bHideBar").click(); await page.locator("#bShowBar").click();
  expect(errs).toEqual([]);
});

test("the web view: every tab and tool", async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watch(page);
  await openApp(page);
  await crawlDone(page);
  await page.locator("#bWeb").click();
  // Web tab: open, go deeper, back with the hub and the trail
  const box = await page.locator("#orbCanvas").boundingBox();
  await expect(async () => { await page.mouse.click(box.x + box.width / 2 + Math.min(box.width, box.height) * 0.16, box.y + box.height / 2 + 4); await expect(page.locator("#orbTrail button")).toHaveCount(2, { timeout: 1500 }); }).toPass();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await expect(page.locator("#orbTrail button")).toHaveCount(1);
  // Nest: zoom, fit, labels, notes, reset, list
  await page.locator('#wvTabs [data-tab="graph"]').click(); await settle(page, 800);
  for (const id of ["gZoomIn", "gZoomIn", "gZoomOut", "gFit", "gLabels", "gLabels", "gNotes", "gNotes", "gReset", "gListBtn", "gListBtn"]) { await page.locator("#" + id).click(); await settle(page, 150); }
  const nb = await page.locator("#wvCanvas").boundingBox();
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.mouse.down(); await page.mouse.move(nb.x + nb.width / 2 + 60, nb.y + nb.height / 2 + 40, { steps: 5 }); await page.mouse.up();
  await page.mouse.wheel(0, -300); await page.mouse.wheel(0, 300);
  // Graph, Media, Timeline, Compare, Flashcards
  await page.locator('#wvTabs [data-tab="chart"]').click(); await page.locator("#pChart .cbar").first().click(); await expect(page.locator('#wvTabs [data-tab="orb"]')).toHaveAttribute("aria-selected", "true");
  await page.locator('#wvTabs [data-tab="chart"]').click(); await page.locator("#pChart [data-chart-cat]").first().click();
  await page.locator("#wvCats .chip").first().click(); await page.locator("#wvCats .chip").first().click();
  await page.locator('#wvTabs [data-tab="media"]').click(); await expect(page.locator("#pMedia")).toContainText("No pictures");
  await page.locator('#wvTabs [data-tab="timeline"]').click(); await settle(page, 300);
  const tb = await page.locator("#tlCanvas").boundingBox(); if (tb) { await page.mouse.click(tb.x + tb.width * 0.6, tb.y + 30); await settle(page, 300); }
  if (await page.locator("#wv").isHidden()) await page.locator("#bWeb").click();
  await page.locator('#wvTabs [data-tab="compare"]').click();
  await page.locator("#cmpTitle").fill("Other notes on spiders");
  await page.locator("#cmpText").fill("Spiders use silk to build webs and wrap prey. Orb weavers build wheel-shaped webs. Jumping spiders hunt without webs. Venom helps spiders catch insects. Tarantulas are large hairy spiders. Spider silk is stronger than steel.");
  await page.locator("#cmpGo").click(); await expect(page.locator("#pCompare")).toContainText(/both|only|shared|in common/i);
  await page.locator("#cmpClear").click();
  await page.locator('#wvTabs [data-tab="cards"]').click();
  for (const a of ["flip", "next", "flip", "prev"]) { const b = page.locator(`#pCards [data-fc="${a}"]`); if (await b.count()) { await b.first().click(); await settle(page, 120); } }
  const study = page.locator('#pCards [data-fc="study"]'); if (await study.count()) { await study.first().click(); for (let i = 0; i < 3; i++) { await page.keyboard.press("Space"); await page.keyboard.press(String(1 + i)); await settle(page, 150); } }
  // pick keywords for a sac and wrap them
  await page.locator('#wvTabs [data-tab="orb"]').click();
  await page.locator("#wvPick").click();
  for (const c of (await page.locator("#wvSide .kwc").all()).slice(0, 3)) await c.click();
  await expect(page.locator("#wvPickBar")).toBeVisible();
  await page.locator("#pickClear").click();
  await page.locator("#wvPick").click(); await page.locator("#wvPick").click();
  for (const c of (await page.locator("#wvSide .kwc").all()).slice(0, 3)) await c.click();
  await page.locator("#pickWrap").click();
  await expect(page.locator("#wv")).toBeHidden();
  // exports
  await page.locator("#bWeb").click();
  expect(await download(page, () => page.locator("#exMd").click())).toMatch(/\.md$/);
  expect(await download(page, () => page.locator("#exCsv").click())).toMatch(/keywords\.csv$/);
  expect(await download(page, () => page.locator("#exCards").click())).toMatch(/flashcards\.csv$/);
  await page.locator("#wvCopy").click();
  await page.locator("#wvAll").check(); await settle(page, 300); await page.locator("#wvAll").uncheck();
  await page.locator("#wvClose").click();
  expect(errs).toEqual([]);
});

test("egg sacs, notes, Ask, Find and the study guide", async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watch(page);
  await openApp(page);
  await crawlDone(page);
  // a sac: rename, read aloud, export, merge
  await page.locator("#bWeb").click();
  const sacChip = page.locator("#wvSide [data-sac]").first();
  await expect(sacChip).toBeVisible({ timeout: 30000 });
  await sacChip.click();
  await expect(page.locator("#dSac")).toBeVisible();
  await page.locator("#sacName").fill("My spider sac");
  await page.locator("#sacRead").click(); await settle(page, 300); await page.locator("#sacRead").click();
  expect(await download(page, () => page.locator("#sacExport").click())).toMatch(/\.md$/);
  if (await page.locator("#sacMergeSel option").count()) { await page.locator("#sacMergeSel").selectOption({ index: 0 }); await page.locator("#sacMerge").click(); }
  await page.locator("#sacClose").click(); await expect(page.locator("#dSac")).toBeHidden();
  await page.locator("#wvClose").click();
  // a note on a keyword, then deleting it
  await page.locator("#page .kw").first().click();
  const addNote = page.locator('#pop [data-note], #pop button', { hasText: /note/i }).first();
  if (await addNote.count()) {
    await addNote.click(); await expect(page.locator("#dNote")).toBeVisible();
    await page.locator("#noteText").fill("Remember this one"); await page.locator('#fNote button[type="submit"]').click();
    await page.locator("#page .kw").first().click();
    await page.locator('#pop button', { hasText: /note/i }).first().click();
    await page.locator("#noteDel").click(); await expect(page.locator("#dNote")).toBeHidden();
    await page.locator("#page .kw").first().click(); await page.locator('#pop button', { hasText: /note/i }).first().click(); await page.locator("#noteCancel").click();
  }
  // Ask: answer, read aloud, copy, history
  await tool(page, "bAsk");
  await page.locator("#askQ").fill("How do spiders make silk?"); await page.locator("#askGo").click();
  await expect(page.locator("#askPassages li").first()).toBeVisible();
  await page.locator("#askRead").click(); await page.locator("#askRead").click();
  await page.locator("#askCopy").click();
  await page.locator("#askClose").click();
  // Find: search, contents, sources, copy bibliography
  await tool(page, "bFind");
  await page.locator("#findQ").fill("silk"); await expect(page.locator("#findResults li").first()).toBeVisible();
  await page.locator("#findResults [data-si]").first().click();
  if (await page.locator("#findPanel").isHidden()) await tool(page, "bFind");
  await page.locator('#findTabs [data-ft="contents"]').click(); await page.locator("#tocList button, #tocList a").first().click();
  if (await page.locator("#findPanel").isHidden()) await tool(page, "bFind");
  await page.locator('#findTabs [data-ft="sources"]').click(); await page.locator("#copyBib").click();
  await page.locator("#findClose").click();
  // the study guide: every button
  await tool(page, "bGuide");
  await expect(page.locator("#guideBody section").first()).toBeVisible();
  await page.locator("#guideBody .cite").first().click();
  await tool(page, "bGuide");
  expect(await download(page, () => page.locator("#guideMd").click())).toMatch(/study-guide\.md$/);
  expect(await download(page, () => page.locator("#guideHtml").click())).toMatch(/study-guide\.html$/);
  await page.locator("#guideCopy").click();
  await page.locator("#guideCards").click(); await expect(page.locator('#wvTabs [data-tab="cards"]')).toHaveAttribute("aria-selected", "true");
  await page.locator("#wvClose").click();
  // live stats: open, close with its button and with Escape
  await page.locator("body").press("s"); await expect(page.locator("#statsPanel")).toBeVisible();
  await page.locator("#spClose").click(); await expect(page.locator("#statsPanel")).toBeHidden();
  await page.locator("body").press("s"); await page.keyboard.press("Escape"); await expect(page.locator("#statsPanel")).toBeHidden();
  expect(errs).toEqual([]);
});

test("library, weave codes, crawl files and backups", async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watch(page);
  await openApp(page);
  await crawlDone(page);
  await tool(page, "bLib");
  await page.locator("#cfgMyName").fill("Sam");
  await page.locator("#libName").fill("Spider study"); await page.locator("#libSave").click();
  await expect(page.locator("#libList")).toContainText("Spider study");
  if (await page.locator("#libSaveNew").isVisible()) { await page.locator("#libSaveNew").click(); }
  // weave code out and back in
  await page.locator("#weaveMake").click(); await expect(page.locator("#weaveOut")).toBeVisible();
  const code = await page.locator("#weaveOut").inputValue(); expect(code.length).toBeGreaterThan(40);
  if (await page.locator("#weaveCopy").isVisible()) await page.locator("#weaveCopy").click();
  await page.locator("#weaveIn").fill(code); await page.locator("#weaveOpen").click(); await settle(page, 1500);
  // crawl file out and back in
  await closeAll(page); await tool(page, "bLib");
  const [cf] = await Promise.all([page.waitForEvent("download"), page.locator("#crawlExport").click()]);
  const cfPath = await cf.path();
  await page.locator("#crawlImport").setInputFiles(cfPath); await settle(page, 1200);
  // backup out and back in
  await closeAll(page); await tool(page, "bLib");
  const [bk] = await Promise.all([page.waitForEvent("download"), page.locator("#backupMake").click()]);
  await page.locator("#backupIn").setInputFiles(await bk.path()); await settle(page, 1200);
  // open and delete from the list
  await closeAll(page); await tool(page, "bLib");
  const open = page.locator("#libList button", { hasText: /open/i }).first();
  if (await open.count()) { await open.click(); await settle(page, 1200); await closeAll(page); await tool(page, "bLib"); }
  const del = page.locator("#libList button", { hasText: /delete|remove/i }).first();
  if (await del.count()) await del.click();
  expect(errs).toEqual([]);
});

test("Open: sample, your own text with details, search results, and adding sources", async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watch(page);
  await page.route("https://en.wikipedia.org/w/api.php?action=query&list=search**", r => r.fulfill({ json: { query: { search: [{ title: "Spider silk", snippet: "silk" }] } } }));
  await page.route("https://r.jina.ai/https://html.duckduckgo.com/**", r => r.fulfill({ body: "Title: results\n\nMarkdown Content:\n[Silk facts](https://silk.example/facts)\n" }));
  await openApp(page);
  await tool(page, "bSource");
  await page.locator("#srcTextR").check();
  await page.locator("#srcText").fill("Silk is made by spiders. ".repeat(4) + "Spider silk is strong and light. Orb weavers spin silk into webs. Silk proteins are called spidroins. Spidroins line up as silk is pulled. ".repeat(4));
  await page.locator("#srcTitle").fill("Notes on silk"); await page.locator("#srcAuthor").fill("Ana Ruiz"); await page.locator("#srcYear").fill("2024"); await page.locator("#srcCite").fill("Field notes, 2024");
  await page.locator("#srcLang").selectOption({ index: 1 }); await page.locator("#srcLang").selectOption("auto");
  await page.locator("#srcAdd").click(); await expect(page.locator("#srcList li")).toHaveCount(1);
  await page.locator("#srcSearchR").check();
  await page.locator("#webQ").fill("spider silk"); await page.locator("#webGo").click();
  await expect(page.locator("#webResults")).toContainText("Spider silk", { timeout: 15000 });
  await page.locator("#srcCancel").click(); await expect(page.locator("#dSource")).toBeHidden();
  await tool(page, "bSource"); await page.locator("#srcSample").check(); await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden();
  // "crawl further" settings for links
  await tool(page, "bSource"); await page.locator("#srcUrlR").check();
  for (const [id, v] of [["cfgFollow", "3"], ["cfgDepth", "2"]]) await page.locator("#" + id).fill(v);
  await page.locator("#cfgSameSite").click(); await page.locator("#cfgSameSite").click();
  await page.locator("#srcCancel").click();
  expect(errs).toEqual([]);
});

test("Help, point at anything, the store, support and the code reader's extra buttons", async ({ page }) => {
  test.setTimeout(240_000);
  const errs = watch(page);
  await openApp(page, { flies: 3 });
  // point at many things
  await page.locator("#bHelp").click(); await page.locator("#helpPoint").click();
  for (const sel of ["#mbSpider", "#bWeb", "#bSettings", "#focus", ".stats", "#page h1", "#page p"]) { await page.locator(sel).first().click({ force: true }); await expect(page.locator("#xpTip")).toBeVisible(); }
  const pb = await page.locator("#page").boundingBox();
  for (let i = 0; i < 6; i++) await page.mouse.click(pb.x + 40 + i * 70, pb.y + 200 + i * 30);
  await page.locator("#xpDone").click(); await expect(page.locator("#xpBar")).toBeHidden();
  // support page: copy ID, check updates, open help and pointing from Settings
  await page.locator("#bSettings").click(); await page.locator("#setHelp").click();
  await page.locator("#supCopy").click();
  await page.locator("#updCheck").click(); await expect(page.locator("#updNote")).not.toBeEmpty();
  await page.locator("#repCfg").click(); await page.locator("#repCfg").click();
  await page.locator("#supHelp").click(); await expect(page.locator("#dHelp")).toBeVisible(); await page.keyboard.press("Escape");
  await page.locator("#bSettings").click(); await page.locator("#setHelp").click(); await page.locator("#supTour").click(); await expect(page.locator("#xpBar")).toBeVisible(); await page.keyboard.press("Escape");
  // settings footer buttons
  await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="moves"]').click();
  if (await page.locator("#replay").isVisible()) { await page.locator("#replay").click(); await settle(page, 600); await page.locator("#bSettings").click(); }
  await page.locator("#bRestart").click(); await expect(page.locator("#dSettings")).toBeHidden();
  // the store: open every card's details
  await page.locator("#bSettings").click(); await page.locator("#bStore").click();
  for (const cat of await page.locator("#stTabs button").evaluateAll(bs => bs.map(b => b.dataset.cat))) {
    await page.locator(`#stTabs [data-cat="${cat}"]`).click();
    for (const card of (await page.locator("#stBody [data-open]").all()).slice(0, 4)) { await card.click(); await expect(page.locator("#stSheet")).toBeVisible(); await page.locator("#stSheetClose").click(); }
  }
  await page.locator("#stBack").click();
  // code reader extras
  await page.keyboard.press("Escape");
  await tool(page, "bCode");
  await page.locator("#cdOpen").click(); await page.locator("#cdExample").click();
  await page.locator('#cdTabs [data-cdt="docs"]').click();
  expect(await download(page, () => page.locator("#cdSaveMd").click())).toMatch(/explained\.md$/);
  await page.locator("#cdOpen").click(); await page.locator("#cdPasteBtn").click();
  await page.locator("#cdPasteText").fill("def greet(name):\n    return 'hi ' + name\n"); await page.locator("#cdPasteName").fill("hi.py"); await page.locator("#cdPasteGo").click();
  await expect(page.locator("#cdSum")).toContainText("hi.py");
  await page.locator("#cdBack").click();
  expect(errs).toEqual([]);
});
