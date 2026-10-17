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
