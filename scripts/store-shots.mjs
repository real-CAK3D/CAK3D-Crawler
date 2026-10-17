// Takes the Google Play store screenshots and a short demo video from the built app (www/).
// Phone: 1080×1920 (9:16). Tablet: 1920×1080 (16:9). Video: 1280×720 .webm for YouTube.
// Run: npm run build && node scripts/store-shots.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, rename, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = "www", OUT = "store-listing";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm" };
const srv = createServer(async (q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end(); }
}).listen(4470);
const URL = "http://localhost:4470/";

async function tool(page, id) {
  const where = await page.locator("#" + id).evaluate(el => { const m = el.closest(".tb-menu"); return m ? m.getAttribute("aria-labelledby") : null; });
  if (where) await page.locator("#" + where).click();
  await page.locator("#" + id).click();
}
async function crawlDone(page) {
  for (let i = 0; i < 300; i++) {
    const [a, b] = await Promise.all([page.locator("#sCrawled").textContent(), page.locator("#sTotal").textContent()]);
    if (+a > 0 && a === b) return; await page.waitForTimeout(500);
  }
}
const still = page => page.mouse.wheel(0, 1); // scrolling yourself stops the page following the spider

async function shoot(browser, { name, viewport, scale, list }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: "light" });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("page error:", e.message));
  await page.addInitScript(() => localStorage.setItem("cak3d-cfg", JSON.stringify({ speed: 2, flies: 2, tourDone: true })));
  await page.goto(URL);
  let n = 0;
  const snap = async label => { n++; if (!list || list.includes(label)) await page.screenshot({ path: `${OUT}/${name}-${String(n).padStart(2, "0")}-${label}.png` }); };
  await page.waitForTimeout(14000); await snap("guide");
  await page.keyboard.press("s"); await page.waitForTimeout(2500); await snap("live-stats"); await page.keyboard.press("Escape");
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem("cak3d-cfg")); }); // keep going at the same speed
  await crawlDone(page); await page.waitForTimeout(1500);
  await page.locator("#bWeb").click(); await page.waitForTimeout(2500); await snap("web");
  await page.locator('#wvTabs [data-tab="graph"]').click(); await page.waitForTimeout(3500); await snap("nest");
  await page.locator('#wvTabs [data-tab="chart"]').click(); await page.waitForTimeout(1500); await snap("graph");
  await page.locator('#wvTabs [data-tab="cards"]').click(); await page.waitForTimeout(1000); await page.locator('#pCards [data-fc="flip"]').click().catch(() => {}); await page.waitForTimeout(800); await snap("flashcards");
  await page.locator("#wvClose").click();
  await tool(page, "bGuide"); await page.waitForTimeout(1500); await snap("study-guide"); await page.keyboard.press("Escape");
  await tool(page, "bCode"); await page.waitForTimeout(2500); await snap("code-reader");
  await page.locator("#cdBack").click();
  await page.locator("#bSettings").click(); await page.locator("#bStore").click(); await page.waitForTimeout(1500); await snap("looks");
  await ctx.close();
}

async function video(browser) {
  const dir = `${OUT}/_video`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("cak3d-cfg", JSON.stringify({ speed: 1.6, flies: 2, tourDone: true })));
  await page.goto(URL);
  await page.waitForTimeout(12000);
  await page.keyboard.press("s"); await page.waitForTimeout(5000); await page.keyboard.press("Escape");
  await page.waitForTimeout(4000);
  await page.locator("#bWeb").click(); await page.waitForTimeout(4000);
  await page.locator('#wvTabs [data-tab="graph"]').click(); await page.waitForTimeout(4000);
  await page.locator('#wvTabs [data-tab="cards"]').click(); await page.waitForTimeout(1500);
  await page.locator('#pCards [data-fc="flip"]').click().catch(() => {}); await page.waitForTimeout(2500);
  await page.locator("#wvClose").click(); await page.waitForTimeout(800);
  await tool(page, "bCode"); await page.waitForTimeout(4500);
  await ctx.close();
  const f = (await readdir(dir)).find(x => x.endsWith(".webm"));
  await rename(join(dir, f), `${OUT}/arachnotes-demo-1280x720.webm`); await rm(dir, { recursive: true, force: true });
}

await mkdir(OUT, { recursive: true });
for (const f of await readdir(OUT)) if (/^(phone|tablet)-/.test(f)) await rm(join(OUT, f));
const browser = await chromium.launch();
await shoot(browser, { name: "phone", viewport: { width: 360, height: 640 }, scale: 3 });
await shoot(browser, { name: "tablet", viewport: { width: 1280, height: 720 }, scale: 1.5, list: ["guide", "web", "nest", "study-guide", "code-reader"] });
await video(browser);
await browser.close(); srv.close();
console.log("done");
