// Records the short looping clip that plays inside the phone on the website (site/assets/phone-demo.mp4 and .webm).
// The built app (www/) runs at phone size; Chrome's screencast captures sharp 2× frames, and ffmpeg turns them into a
// small silent video with each frame shown for as long as it was on screen.
// Run: npm run build && node scripts/site-phone-video.mjs   (needs ffmpeg on the PATH)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "www", OUT = "site/assets", TMP = "store-listing/_frames";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm" };
const srv = createServer(async (q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end(); }
}).listen(4472);

await rm(TMP, { recursive: true, force: true }); await mkdir(TMP, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, colorScheme: "light" });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem("cak3d-cfg", JSON.stringify({ speed: 1.6, flies: 2, tourDone: true, lookup: "off", startWith: "guide" })));
await page.goto("http://localhost:4472/");
await page.waitForTimeout(2500); // let the spider arrive first

const cdp = await ctx.newCDPSession(page), frames = [];
cdp.on("Page.screencastFrame", async f => {
  frames.push({ data: f.data, t: f.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 720, maxHeight: 1280, everyNthFrame: 1 });
await page.waitForTimeout(13000); // crawling the guide
await page.evaluate(() => scrollTo(0, 0));
await page.locator("#bWeb").click(); await page.waitForTimeout(4500); // the web view
await page.locator("#wvClose").click(); await page.waitForTimeout(1500);
await cdp.send("Page.stopScreencast");
await browser.close(); srv.close();

// each frame lasts until the next one arrived
let list = "";
for (let i = 0; i < frames.length; i++) {
  const name = `f${String(i).padStart(5, "0")}.jpg`;
  await writeFile(join(TMP, name), Buffer.from(frames[i].data, "base64"));
  const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.04;
  list += `file '${name}'\nduration ${Math.max(0.01, d).toFixed(3)}\n`;
}
await writeFile(join(TMP, "list.txt"), list);
const common = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(TMP, "list.txt"), "-vf", "fps=30,scale=540:960:flags=lanczos", "-an"];
execFileSync("ffmpeg", [...common, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-movflags", "+faststart", join(OUT, "phone-demo.mp4")]);
execFileSync("ffmpeg", [...common, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", join(OUT, "phone-demo.webm")]);
await rm(TMP, { recursive: true, force: true });
console.log(`${frames.length} frames → ${OUT}/phone-demo.mp4 and .webm`);
