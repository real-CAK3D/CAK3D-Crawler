// v1.14: the guide the app opens with, what it opens with next time, more file types, website links,
// and the browser version's upload limit
import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { openApp, crawlDone, tool } from "./helpers.mjs";

const watch = page => { const errs = []; page.on("pageerror", e => errs.push(e.message)); return errs; };
const TEXT = "Bees collect nectar from flowers and turn it into honey inside the hive. ".repeat(3) +
  "Worker bees build wax comb, and the queen lays eggs in the comb cells. Honey bees dance to tell other bees where flowers are. " +
  "Beekeepers harvest honey and wax from the hive. Pollination by bees helps flowers and crops grow. ".repeat(3);

async function loadText(page, text = TEXT, title = "Bee notes") {
  await tool(page, "bSource");
  await page.locator("#srcTextR").check();
  await page.locator("#srcText").fill(text);
  await page.locator("#srcTitle").fill(title);
  await page.locator("#srcGo").click();
}
async function openFile(page, name, buffer) {
  await tool(page, "bSource");
  await page.locator("#srcFile").setInputFiles({ name, mimeType: "application/octet-stream", buffer });
}

test("the app opens on the guide, and the spider crawls all of it", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await expect(page.locator("#docTitle")).toHaveText("Arachnotes");
  await expect(page.locator("#page .demo")).toHaveCount(8);
  await expect(page.locator("#page [data-try]")).toHaveCount(5);
  expect(+(await page.locator("#sTotal").textContent())).toBeGreaterThan(40);
  await crawlDone(page);
  // the topics are the guide's own
  await page.locator("#bWeb").click();
  await expect(page.locator("#wv")).toContainText("Study tools");
  await page.locator("#wvClose").click();
  expect(errs).toEqual([]);
});

test("Settings: open where I left off, on the guide, or on a blank page", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await loadText(page);
  await expect(page.locator("#docTitle")).toHaveText("Bee notes");
  await page.waitForTimeout(1200);
  // where I left off (the default)
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.reload();
  await expect(page.locator("#docTitle")).toHaveText("Bee notes");
  // a blank page, and everything still works on it
  await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#cfgStart").selectOption("blank");
  await page.keyboard.press("Escape");
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem("cak3d-cfg")); localStorage.setItem("cak3d-cfg-keep", JSON.stringify(c)); });
  await page.addInitScript(() => { const k = localStorage.getItem("cak3d-cfg-keep"); if (k) localStorage.setItem("cak3d-cfg", k); });
  await page.reload();
  await expect(page.locator("#docTitle")).toHaveText("New page");
  await expect(page.locator(".blank-start")).toBeVisible();
  await page.locator("#bWeb").click(); await page.waitForTimeout(500); await page.locator("#wvClose").click();
  await tool(page, "bAsk"); await page.locator("#askQ").fill("anything?"); await page.locator("#askGo").click(); await page.keyboard.press("Escape");
  await page.locator('.blank-start [data-try="guide"]').click();
  await expect(page.locator("#docTitle")).toHaveText("Arachnotes");
  // the guide every time
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem("cak3d-cfg")); c.startWith = "guide"; localStorage.setItem("cak3d-cfg-keep", JSON.stringify(c)); });
  await loadText(page, TEXT, "More bees");
  await page.reload();
  await expect(page.locator("#docTitle")).toHaveText("Arachnotes");
  expect(errs).toEqual([]);
});

test("opens Word, PowerPoint, Excel, OpenDocument, RTF, web pages, subtitles, notebooks, CSV and JSON", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  const zip = async files => { const z = new JSZip(); for (const [n, t] of Object.entries(files)) z.file(n, t); return z.generateAsync({ type: "nodebuffer" }); };
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const core = t => `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${t}</dc:title><dc:creator>Ana Ruiz</dc:creator></cp:coreProperties>`;
  const cases = [
    ["notes.docx", await zip({ "docProps/core.xml": core("Hive notes"), "word/document.xml": `<w:document ${W}><w:body><w:p><w:r><w:t>Bees make honey</w:t></w:r><w:r><w:t xml:space="preserve"> in the hive.</w:t></w:r></w:p><w:p><w:r><w:t>Wax comb holds the honey.</w:t></w:r></w:p></w:body></w:document>` }), /Bees make honey in the hive\.\n\nWax comb holds the honey\./, "Hive notes"],
    ["deck.pptx", await zip({ "ppt/slides/slide2.xml": `<p:sld xmlns:p="p" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Second slide on pollen</a:t></a:r></a:p></p:sld>`, "ppt/slides/slide1.xml": `<p:sld xmlns:p="p" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>First slide on bees</a:t></a:r></a:p></p:sld>` }), /First slide on bees\n\nSecond slide on pollen/],
    ["hives.xlsx", await zip({ "xl/sharedStrings.xml": `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Hive</t></si><si><t>Bees</t></si><si><t>North</t></si></sst>`, "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c><v>40000</v></c></row></sheetData></worksheet>` }), /Hive: North; Bees: 40000\./],
    ["notes.odt", await zip({ "meta.xml": `<office:document-meta xmlns:office="o" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Open notes</dc:title></office:document-meta>`, "content.xml": `<office:document-content xmlns:office="o" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><text:h>Bees</text:h><text:p>Bees dance to share news.</text:p></office:document-content>` }), /Bees\n\nBees dance to share news\./, "Open notes"],
    ["old.rtf", Buffer.from("{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}\\f0 Bees love clover\\par Honey is sweet\\'e9\\par}"), /Bees love clover\n\nHoney is sweeté/],
    ["saved.html", Buffer.from("<html><head><title>Saved bee page</title></head><body><nav>Menu stuff</nav><main><h1>Bees</h1><p>Bees visit many flowers.</p></main></body></html>"), /^Bees\n\nBees visit many flowers\.$/, "Saved bee page"],
    ["talk.srt", Buffer.from("1\n00:00:01,000 --> 00:00:03,000\nBees make honey.\n\n2\n00:00:03,500 --> 00:00:05,000\n<i>They live in hives.</i>\n"), /^Bees make honey\. They live in hives\.$/],
    ["study.ipynb", Buffer.from(JSON.stringify({ cells: [{ cell_type: "markdown", source: ["# Bee study\n", "Bees pollinate crops."] }, { cell_type: "code", source: ["print(1)"] }] })), /Bee study\nBees pollinate crops\./, "Bee study"],
    ["hives.csv", Buffer.from('Hive,Notes\nNorth,"Calm, strong"\nSouth,Busy\n'), /Hive: North; Notes: Calm, strong\.\n\nHive: South; Notes: Busy\./],
    ["data.json", Buffer.from(JSON.stringify({ hive: { name: "North hive", notes: ["Bees were calm"] }, count: 4 })), /name: North hive\.\n\nnotes: Bees were calm\./]
  ];
  for (const [name, buf, want, title] of cases) {
    await openFile(page, name, buf);
    await expect(page.locator("#srcText"), name).toHaveValue(want);
    if (title) await expect(page.locator("#srcTitle"), name).toHaveValue(title);
    await page.locator("#srcText").fill(""); await page.locator("#srcTitle").fill(""); await page.locator("#srcAuthor").fill("");
    await page.locator("#srcCancel").click();
  }
  // old and unsupported formats explain what to do
  for (const [name, msg] of [["old.doc", /\.docx/], ["talk.key", /Export it as PDF/], ["photo.heic", /JPEG/]]) {
    await openFile(page, name, Buffer.from("x"));
    await expect(page.locator("#srcErr, #srcMsg, .err").filter({ hasText: msg }).first(), name).toBeVisible();
    await page.locator("#srcCancel").click();
  }
  expect(errs).toEqual([]);
});

test("the code reader reads notebooks and close relatives like Elixir", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await tool(page, "bCode");
  const nb = JSON.stringify({ metadata: { kernelspec: { language: "python" } }, cells: [{ cell_type: "markdown", source: ["Loads hives"] }, { cell_type: "code", source: ["def load_hives(path):\n", "    return open(path).read()\n"] }] });
  await page.locator("#cdFiles").setInputFiles([{ name: "study.ipynb", mimeType: "application/json", buffer: Buffer.from(nb) }, { name: "hive.ex", mimeType: "text/plain", buffer: Buffer.from("defmodule Hive do\n  def count(bees) do\n    length(bees)\n  end\nend\n") }]);
  await expect(page.locator("#cdSide")).toContainText("2 functions");
  await page.locator('#cdTabs [data-cdt="docs"]').click();
  await expect(page.locator("#cdDocs")).toContainText("load_hives");
  expect(errs).toEqual([]);
});

test("Settings links to the website, its Issues and Ideas, privacy policy and terms", async ({ page }) => {
  await openApp(page);
  await page.locator("#bSettings").click();
  const links = page.locator(".site-links a");
  await expect(links).toHaveCount(6);
  expect(await links.evaluateAll(a => a.map(x => x.href))).toEqual(["https://arachnotes-web.vercel.app/", "https://arachnotes-web.vercel.app/issues", "https://arachnotes-web.vercel.app/ideas", "https://arachnotes-web.vercel.app/privacy", "https://arachnotes-web.vercel.app/terms", "https://arachnotes-web.vercel.app/data"]);
});

test.describe("the browser version's 2 free uploads", () => {
  test.beforeEach(async ({ page }) => {
    // the hosted browser version is built with CRAWLER_WEB_UPLOADS=2
    await page.route("**/config.js", async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/"webUploads": \d+/, '"webUploads": 2') }); });
  });
  test("two uploads work, the third is stopped, and clearing storage or reloading doesn't reset it", async ({ page }) => {
    const errs = watch(page);
    await openApp(page);
    await tool(page, "bSource");
    await expect(page.locator("#webqSrc")).toHaveText(/2 of 2 free uploads left/);
    await page.locator("#srcCancel").click();
    await loadText(page, TEXT, "One"); await expect(page.locator("#docTitle")).toHaveText("One");
    await tool(page, "bSource"); await expect(page.locator("#webqSrc")).toHaveText(/1 of 2 free uploads left/); await page.locator("#srcCancel").click();
    await loadText(page, TEXT, "Two"); await expect(page.locator("#docTitle")).toHaveText("Two");
    // the third is stopped before anything loads
    await loadText(page, TEXT, "Three");
    await expect(page.locator("#dLimit")).toBeVisible();
    await expect(page.locator("#limGet")).toHaveAttribute("href", "https://arachnotes-web.vercel.app/#download");
    await page.locator('#dLimit button[value="close"]').click();
    await page.locator("#srcCancel").click();
    await expect(page.locator("#docTitle")).toHaveText("Two");
    // files can't even be picked, and the code reader is limited too
    await tool(page, "bSource"); await page.locator("#srcFile").click({ force: true }).catch(() => {});
    await expect(page.locator("#dLimit")).toBeVisible(); await page.locator('#dLimit button[value="close"]').click(); await page.locator("#srcCancel").click();
    await tool(page, "bCode"); await page.locator("#cdOpen").click(); await page.locator("#cdPasteBtn").click();
    await page.locator("#cdPasteText").fill("function a() { return 1; }"); await page.locator("#cdPasteGo").click();
    await expect(page.locator("#dLimit")).toBeVisible(); await page.locator('#dLimit button[value="close"]').click();
    // the built-in example still works
    await page.locator("#cdOpen").click(); await page.locator("#cdExample").click();
    await expect(page.locator("#dLimit")).toBeHidden();
    await page.locator("#cdBack").click();
    // clearing local storage alone doesn't reset it (a cookie and IndexedDB remember), and nor does reloading
    await page.evaluate(() => localStorage.removeItem("an-wu"));
    await page.reload();
    await tool(page, "bSource"); await expect(page.locator("#webqSrc")).toHaveText(/used the 2 free uploads/); await page.locator("#srcCancel").click();
    await page.evaluate(() => { localStorage.removeItem("an-wu"); document.cookie = "an_wu=; max-age=0; path=/"; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.querySelector("#webqSrc").textContent)).toMatch(/used the 2 free uploads/);
    expect(errs).toEqual([]);
  });
  test("several sources at once count one each, and the guide's examples are free", async ({ page }) => {
    await page.route("https://en.wikipedia.org/**", r => r.fulfill({ json: { parse: { title: "Honey bee", text: { "*": `<p>${TEXT}</p>` } } } }));
    await openApp(page);
    await tool(page, "bSource");
    await page.locator("#srcTextR").check(); await page.locator("#srcText").fill(TEXT); await page.locator("#srcTitle").fill("A");
    await page.locator("#srcAdd").click();
    await page.locator("#srcText").fill(TEXT); await page.locator("#srcTitle").fill("B");
    await page.locator("#srcAdd").click();
    await page.locator("#srcText").fill(TEXT); await page.locator("#srcTitle").fill("C");
    await page.locator("#srcGo").click();
    await expect(page.locator("#dLimit")).toBeVisible(); // 3 sources, only 2 left
    await expect(page.locator("#limMsg")).toContainText("2 left");
    await page.locator('#dLimit button[value="close"]').click(); await page.locator("#srcCancel").click();
    expect(await page.evaluate(() => localStorage.getItem("an-wu"))).toBeNull();
  });
});

test("asking about something that isn't in the text doesn't stop the crawl", async ({ page }) => {
  await openApp(page);
  await tool(page, "bAsk"); await page.locator("#askQ").fill("What is a zeppelin?"); await page.locator("#askGo").click(); await page.keyboard.press("Escape");
  await expect(page.locator("#focus")).toHaveValue("");
  expect(+(await page.locator("#sTotal").textContent())).toBeGreaterThan(40);
  await crawlDone(page);
});

test("tricky files: saved pages built from divs, Word-style RTF quotes, stray CSV quotes, UTF-16 text, broken XML", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Spiders spin silk.\r\nOrb weavers build webs.", "utf16le")]);
  const cases = [
    ["divs.html", Buffer.from("<html><body><div class='post'><div>Orb weavers rebuild their webs every night.</div></div></body></html>"), /Orb weavers rebuild their webs every night\./],
    ["quotes.rtf", Buffer.from(String.raw`{\rtf1\ansi The spider\'92s web\par \'93Silk\'94 is strong \u8212? really\par}`, "latin1"), /The spider’s web\n\n“Silk” is strong — really/],
    ["sizes.csv", Buffer.from('Item,Size\nMonitor,27" wide\nDesk,Large\n'), /Item: Monitor; Size: 27" wide\.\n\nItem: Desk; Size: Large\./],
    ["notes.txt", utf16, /^Spiders spin silk\.\r?\nOrb weavers build webs\.$/]
  ];
  for (const [name, buf, want] of cases) {
    await openFile(page, name, buf);
    await expect(page.locator("#srcText"), name).toHaveValue(want);
    await page.locator("#srcText").fill(""); await page.locator("#srcTitle").fill(""); await page.locator("#srcCancel").click();
  }
  await openFile(page, "broken.xml", Buffer.from("<feed><title>Spiders</title>"));
  await expect(page.locator(".err, #srcErr").filter({ hasText: /XML file isn't complete/ }).first()).toBeVisible();
  await page.locator("#srcCancel").click();
  expect(errs).toEqual([]);
});

test("a repeated keyword in the guide opens the keyword, not Wikipedia", async ({ page }) => {
  await openApp(page);
  const echo = page.locator("#page a.echo").first();
  await expect(echo).not.toHaveAttribute("href", /./);
  await page.mouse.wheel(0, 5); await echo.click();
  await expect(page.locator("#pop")).toBeVisible();
});

test.describe("upload counting is exact", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/config.js", async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/"webUploads": \d+/, '"webUploads": 2') }); });
  });
  test("a guide example doesn't let queued sources crawl for free", async ({ page }) => {
    await page.route("https://en.wikipedia.org/**", r => r.fulfill({ json: { parse: { title: "Orb-weaver spider", text: { "*": `<p>${TEXT}</p>` } } } }));
    await openApp(page);
    await tool(page, "bSource"); await page.locator("#srcTextR").check();
    for (const t of ["A", "B", "C"]) { await page.locator("#srcText").fill(TEXT); await page.locator("#srcTitle").fill(t); await page.locator("#srcAdd").click(); }
    await page.locator("#srcCancel").click();
    await page.mouse.wheel(0, 5); await page.locator('#page [data-try="wiki"]').click();
    await expect(page.locator("#dLimit")).toBeVisible(); // 3 queued + the example: only 2 left
  });
});

test("when it's done, the spider waits until you've left it alone, does its thing, and comes back when you tap", async ({ page }) => {
  test.setTimeout(300_000);
  const errs = watch(page);
  await openApp(page, { exit: "burrow", idleWait: 15, bored: "edges", flies: 0 });
  const logText = () => page.locator("#log").textContent();
  await crawlDone(page);
  // it keeps busy first: a walk around the edges of the screen, and it hasn't left yet
  await expect.poll(logText, { timeout: 20_000 }).toMatch(/goes for a walk around the screen/);
  expect(await logText()).not.toMatch(/burrowed into the page/);
  await expect(page.locator("#status")).toContainText("Crawl complete");
  // left alone for 15 seconds, it burrows into the page
  await expect.poll(logText, { timeout: 30_000 }).toMatch(/burrowed into the page/);
  await expect(page.locator("#status")).toContainText("went off while you were away", { timeout: 15_000 });
  // a tap brings it back
  const before = (await logText()).match(/crawled in|dropped in|climbed up|floated in|hatched onto|appeared/g)?.length || 0;
  await page.mouse.click(640, 500);
  await expect.poll(async () => ((await logText()).match(/crawled in|dropped in|climbed up|floated in|hatched onto|appeared/g)?.length || 0), { timeout: 10_000 }).toBeGreaterThan(before);
  expect(errs).toEqual([]);
});

test("the first-run walkthrough: Next, Back and Skip, and it doesn't come back once done", async ({ page }) => {
  const errs = watch(page);
  await openApp(page, { tourDone: false });
  await expect(page.locator("#tour")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#tourH")).toHaveText("Welcome to Arachnotes");
  await expect(page.locator("#tourBack")).toBeHidden();
  await page.locator("#tourNext").click();
  await expect(page.locator("#tourH")).toHaveText("The page");
  await page.locator("#tourNext").click();
  await expect(page.locator("#tourH")).toHaveText("Open your own");
  // the spotlight sits on the Pages menu
  await page.waitForTimeout(500);
  const hole = await page.locator("#tourHole").boundingBox(), menu = await page.locator("#mbPages").boundingBox();
  expect(Math.abs(hole.x + hole.width / 2 - (menu.x + menu.width / 2))).toBeLessThan(4);
  await page.locator("#tourBack").click();
  await expect(page.locator("#tourH")).toHaveText("The page");
  for (let i = 0; i < 6; i++) await page.locator("#tourNext").click();
  await expect(page.locator("#tourNext")).toHaveText("Done");
  await page.locator("#tourNext").click();
  await expect(page.locator("#tour")).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cak3d-cfg")).tourDone)).toBe(true);
  // it can be taken again from Help, and skipped
  await page.locator("#bHelp").click(); await page.locator("#helpTour").click();
  await expect(page.locator("#tour")).toBeVisible();
  await page.locator("#tourSkip").click();
  await expect(page.locator("#tour")).toBeHidden();
  expect(errs).toEqual([]);
});

test("the walkthrough fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, { tourDone: false });
  await expect(page.locator("#tour")).toBeVisible({ timeout: 5000 });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(400);
    const c = await page.locator("#tourCard").boundingBox();
    expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x + c.width).toBeLessThanOrEqual(390); expect(c.y + c.height).toBeLessThanOrEqual(844);
    await page.locator("#tourNext").click();
  }
  await expect(page.locator("#tour")).toBeHidden();
});

test("sharing a link to the installed web app crawls it", async ({ page }) => {
  await page.route("https://en.wikipedia.org/**", r => r.fulfill({ json: /media-list/.test(r.request().url()) ? { items: [] }
    : { query: { pages: { 1: { title: "Orb-weaver spider", extract: TEXT, links: [] } } } } }));
  await page.addInitScript(() => localStorage.setItem("cak3d-cfg", JSON.stringify({ speed: 4, tourDone: true })));
  await page.goto("/?title=Orb&text=Look%20at%20this&url=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FOrb-weaver_spider");
  await expect(page.locator("#docTitle")).toHaveText("Orb-weaver spider", { timeout: 30_000 });
  expect(page.url()).not.toContain("?");
});

test("sharing plain text crawls it as text", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cak3d-cfg", JSON.stringify({ speed: 4, tourDone: true })));
  await page.goto("/?title=Bee%20notes&text=" + encodeURIComponent(TEXT));
  await expect(page.locator("#docTitle")).toHaveText("Bee notes", { timeout: 30_000 });
});

test("Settings offers a free on-device AI with its own download panel", async ({ page }) => {
  await openApp(page);
  await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#aiService").selectOption("device");
  await expect(page.locator("#aiDeviceBox")).toBeVisible();
  await expect(page.locator("#aiKeyBox")).toBeHidden();
  await expect(page.locator("#aiModel")).toBeHidden();
  await expect(page.locator("#aiDevStatus")).toContainText(/isn't downloaded yet|built-in AI/);
  await page.locator("#aiSave").click();
  await expect(page.locator("#aiNote")).toContainText("written on this device");
  await page.locator("#aiTest").click();
  await expect(page.locator("#aiNote")).toContainText(/Download the model first|It works/, { timeout: 15_000 });
});

test("Android's Back button closes what's on top, one thing at a time, and asks before leaving", async ({ page }) => {
  const errs = watch(page);
  // stand in for the Android app's Capacitor bridge
  await page.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: {}, convertFileSrc: x => x,
      registerPlugin: name => name === "App" ? { addListener: (ev, fn) => { window.__back = fn; return { remove() {} }; }, exitApp: () => { window.__exited = true; } }
        : { addListener: () => ({ remove() {} }), take: async () => ({}) } };
  });
  await openApp(page);
  const back = () => page.evaluate(() => window.__back());
  await page.locator("#bSettings").click(); await expect(page.locator("#dSettings")).toBeVisible();
  await back(); await expect(page.locator("#dSettings")).toBeHidden();
  await page.locator("#bWeb").click(); await expect(page.locator("#wv")).toBeVisible();
  await back(); await expect(page.locator("#wv")).toBeHidden();
  await tool(page, "bCode"); await expect(page.locator("#codePage")).toBeVisible();
  await back(); await expect(page.locator("#codePage")).toBeHidden();
  await page.locator("#mbPages").click(); await expect(page.locator("#mPages")).toBeVisible();
  await back(); await expect(page.locator("#mPages")).toBeHidden();
  // on the page: the first press warns, the second leaves
  await back(); await expect(page.locator(".toast")).toContainText("Press back again");
  expect(await page.evaluate(() => !!window.__exited)).toBe(false);
  await back();
  expect(await page.evaluate(() => !!window.__exited)).toBe(true);
  expect(errs).toEqual([]);
});

test("when something breaks, it asks before sending an error report, and remembers the answer", async ({ page }) => {
  const sent = [];
  await page.route("**/rest/v1/rpc/report_error", async r => { sent.push(JSON.parse(r.request().postData())); await r.fulfill({ status: 204, body: "" }); });
  await openApp(page);
  await page.evaluate(() => setTimeout(() => { throw new Error("Test error from the test suite"); }, 0));
  await expect(page.locator("#errAsk")).toBeVisible();
  expect(sent).toHaveLength(0); // nothing goes until you say so
  await page.locator("#errSend").click();
  await expect(page.locator("#errAsk")).toBeHidden();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].p_message).toContain("Test error from the test suite");
  expect(sent[0].p_user).toMatch(/^AN-/);
  expect(JSON.stringify(sent[0])).not.toContain("Arachnotes turns anything"); // no page text
  // "Don't ask" turns it off for good
  await page.evaluate(() => setTimeout(() => { throw new Error("Another test error"); }, 0));
  await page.locator("#errNo").click();
  await page.evaluate(() => setTimeout(() => { throw new Error("A third test error"); }, 0));
  await page.waitForTimeout(500);
  await expect(page.locator("#errAsk")).toBeHidden();
  expect(sent).toHaveLength(1);
  await page.locator("#bSettings").click(); await page.locator("#setHelp").click();
  await expect(page.locator("#cfgErrReports")).not.toBeChecked();
});

test("a keyword ties to its topic, sentences and paragraphs, with outside information from the web", async ({ page }) => {
  const errs = watch(page), asked = [];
  await page.route("https://*.wikipedia.org/api/rest_v1/page/summary/**", r => { const t = decodeURIComponent(r.request().url().split("/summary/")[1].split("?")[0]).replace(/_/g, " "); asked.push(t);
    r.fulfill({ json: { type: "standard", title: t, extract: `${t} is a test summary. It has a second sentence.`, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + encodeURIComponent(t) } } } }); });
  await page.route("https://*.wikipedia.org/w/api.php?action=query&list=search**", r => r.fulfill({ json: { query: { search: [{ title: "First choice" }, { title: "Second choice" }] } } }));
  await openApp(page, { lookup: "open" });
  await crawlDone(page);
  await page.locator("#bWeb").click();
  await page.locator('#wvSide [data-key]').first().click();
  const side = page.locator("#wvSide");
  // its topic and where it appears
  await expect(side.locator("h3").first()).not.toBeEmpty();
  await expect(side).toContainText("Where it appears");
  // the paragraph around a sentence
  await side.locator("[data-para]").first().click();
  await expect(side.locator(".para-box").first()).toBeVisible();
  await expect(side.locator(".para-box mark").first()).toBeVisible();
  await expect(side.locator("[data-para]").first()).toHaveText("Hide the paragraph");
  // outside information (the guide's keywords use their exact Wikipedia article)
  await expect(side.locator(".webinfo")).toContainText("is a test summary", { timeout: 10_000 });
  await expect(side.locator(".webinfo a")).toHaveAttribute("href", /wikipedia\.org\/wiki\//);
  await side.locator("[data-web-note]").click();
  await expect(side).toContainText("From Wikipedia (");
  // picking another article
  await side.locator("[data-web-other]").click();
  await side.locator('[data-web-pick="Second choice"]').click();
  await expect(side.locator(".webinfo")).toContainText("Second choice is a test summary");
  await page.locator("#wvClose").click();
  // turned off: nothing is looked up
  const before = asked.length;
  await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#cfgLookup").selectOption("off"); await page.keyboard.press("Escape");
  await page.locator("#bWeb").click(); await page.locator('#wvSide [data-key]').nth(3).click();
  await expect(page.locator("#wvSide .web-sec")).toHaveCount(0);
  expect(asked.length).toBe(before);
  expect(errs).toEqual([]);
});

test("phrases don't end in a verb: 'venom helps' isn't a keyword", async ({ page }) => {
  await openApp(page);
  const text = ("Venom helps spiders subdue insects. Venom helps the spider eat. Spider silk is strong. Spider silk makes webs. " +
    "Spiders use silk every day. Spiders use webs to catch insects. Orb weavers spin webs at night. ").repeat(4);
  await loadText(page, text, "Verb test");
  await expect(page.locator("#docTitle")).toHaveText("Verb test");
  const keys = await page.locator("#page .kw").evaluateAll(els => els.map(e => e.dataset.k));
  expect(keys).not.toContain("venom helps");
  expect(keys).not.toContain("spiders use");
  expect(keys).toContain("spider silk");
});

test("outside facts reach flashcards, the study guide, related reading and the Media tab", async ({ page }) => {
  const errs = watch(page);
  const thumb = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Test_picture.jpg/330px-Test_picture.jpg";
  await page.route("https://upload.wikimedia.org/**", r => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
  await page.route("https://*.wikipedia.org/api/rest_v1/page/summary/**", r => { const t = decodeURIComponent(r.request().url().split("/summary/")[1].split("?")[0]).replace(/_/g, " ");
    r.fulfill({ json: { type: "standard", title: t, extract: `${t} is a fact from the web. More detail follows.`, thumbnail: { source: thumb }, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + encodeURIComponent(t) } } } }); });
  const info = { descriptionurl: "https://commons.wikimedia.org/wiki/File:Test_picture.jpg", extmetadata: { Artist: { value: "Ana Ruiz" }, LicenseShortName: { value: "CC BY-SA 4.0" } } };
  await page.route("https://*.wikipedia.org/w/api.php?action=query&prop=imageinfo**", r => r.fulfill({ json: { query: { pages: { "-1": { title: "File:Test_picture.jpg", imageinfo: [info] } } } } }));
  await page.route("https://*.wikipedia.org/w/api.php?action=query&list=search**", r => r.fulfill({ json: { query: { search: [{ title: "Related One" }, { title: "Related Two" }, { title: "Related Three" }] } } }));
  await openApp(page, { lookup: "catch" });
  await crawlDone(page);
  // related reading under each topic, with a way to crawl it
  await page.locator("#bWeb").click();
  await expect(page.locator("#wvSide .read-next").first()).toContainText("Related One", { timeout: 20_000 });
  await expect(page.locator("#wvSide [data-crawl-url]").first()).toBeVisible();
  // the keyword's picture, credited, in the Media tab
  await page.locator('#wvTabs [data-tab="media"]').click();
  await expect(page.locator("#pMedia .md-card").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#pMedia .md-cite").first()).toContainText("Ana Ruiz");
  await expect(page.locator("#pMedia .md-cite").first()).toContainText("CC BY-SA 4.0");
  // flashcards
  await page.locator('#wvTabs [data-tab="cards"]').click();
  await page.locator('#pCards [data-fc="flip"]').click();
  await expect(page.locator("#pCards .webinfo-short")).toContainText("is a fact from the web");
  await page.locator("#wvClose").click();
  // the study guide
  await tool(page, "bGuide");
  await expect(page.locator("#guideBody .g-web").first()).toContainText("Wikipedia: ", { timeout: 15_000 });
  expect(errs).toEqual([]);
});

test("in the background the crawl carries on, and a notification says when it's done", async ({ page }) => {
  const errs = watch(page);
  await page.addInitScript(() => {
    window.__notes = []; window.__hide = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__hide });
    class N { static permission = "default"; static async requestPermission() { N.permission = "granted"; return "granted"; } constructor(t, o) { window.__notes.push({ t, ...o }); } }
    window.Notification = N;
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (t, o) => { window.__notes.push({ t, ...o }); } });
  });
  await openApp(page, { startWith: "blank" });
  // switching it on asks for permission
  await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#cfgNotify").check();
  await expect.poll(() => page.evaluate(() => Notification.permission)).toBe("granted");
  await expect(page.locator("#cfgNotify")).toBeChecked();
  await page.keyboard.press("Escape");
  await loadText(page, TEXT, "Bee notes");
  await expect.poll(async () => +(await page.locator("#sCrawled").textContent())).toBeGreaterThan(0);
  // the app goes to the background: nothing is drawn, but keywords keep coming
  const before = +(await page.locator("#sCrawled").textContent());
  await page.evaluate(() => { window.__hide = true; document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(async () => +(await page.locator("#sCrawled").textContent()), { timeout: 60_000 }).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => window.__notes.length), { timeout: 120_000 }).toBe(1);
  const note = await page.evaluate(() => window.__notes[0]);
  expect(note.t).toMatch(/finished crawling/);
  expect(note.body).toMatch(/“Bee notes”: \d+ keywords? in \d+ topics?/);
  // finishing while you're looking doesn't notify
  await page.evaluate(() => { window.__hide = false; document.dispatchEvent(new Event("visibilitychange")); });
  await loadText(page, TEXT, "Second look");
  await crawlDone(page);
  expect(await page.evaluate(() => window.__notes.length)).toBe(1);
  expect(errs).toEqual([]);
});
