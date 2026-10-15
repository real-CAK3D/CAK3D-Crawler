// Builds the installable web app into www/: wraps the app page in a full HTML document,
// bundles the official Anthropic SDK (for the optional "use my own API key" feature),
// and adds the manifest, service worker and icons.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { build } from "esbuild";

const OUT = "www";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!existsSync("web/icons/icon-192.png")) { console.error("Run `npm run icons` first."); process.exit(1); }

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/icons`, { recursive: true });
mkdirSync(`${OUT}/vendor`, { recursive: true });

// the PDF and EPUB readers ship with the app so they work offline (the claude.ai version loads them from cdnjs)
copyFileSync("node_modules/pdfjs-dist/build/pdf.min.js", `${OUT}/vendor/pdf.min.js`);
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.js", `${OUT}/vendor/pdf.worker.min.js`);
copyFileSync("node_modules/jszip/dist/jszip.min.js", `${OUT}/vendor/jszip.min.js`);
// on-device OCR for scanned pages (the language model itself downloads on first use, then stays cached)
mkdirSync(`${OUT}/vendor/tesseract`, { recursive: true });
mkdirSync(`${OUT}/vendor/tesseract-core`, { recursive: true });
for (const f of ["tesseract.min.js", "worker.min.js"]) copyFileSync(`node_modules/tesseract.js/dist/${f}`, `${OUT}/vendor/tesseract/${f}`);
for (const f of readdirSync("node_modules/tesseract.js-core").filter(f => f.endsWith("lstm.wasm.js")))
  copyFileSync(`node_modules/tesseract.js-core/${f}`, `${OUT}/vendor/tesseract-core/${f}`);

await build({
  stdin: { contents: 'import Anthropic from "@anthropic-ai/sdk"; window.AnthropicSDK = Anthropic;', resolveDir: ".", loader: "js" },
  bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020", outfile: `${OUT}/anthropic.js`, logLevel: "warning"
});

const page = readFileSync("src/arachnotes.html", "utf8");
const head = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#111413">
<meta name="description" content="${pkg.description}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="config.js"></script>
<script src="anthropic.js"></script>
<style>#boot{position:fixed;inset:0;z-index:999;background:#111413;color:#e6ebe7;display:flex;align-items:center;justify-content:center;gap:4vmin;padding:24px;flex-wrap:wrap;transition:opacity .45s ease;font-family:Newsreader,Georgia,serif;overflow:hidden}
#boot.gone{opacity:0;pointer-events:none}#boot svg{position:absolute;inset:0;width:100%;height:100%}#boot img{position:relative;width:min(34vmin,220px);height:auto;border-radius:22%}
#boot div{position:relative;max-width:30rem}#boot b{display:block;font-size:clamp(40px,9vmin,84px);font-weight:600;letter-spacing:-.01em;line-height:1}#boot span{display:block;margin-top:12px;font-size:clamp(17px,3.4vmin,28px);line-height:1.3;color:#c9d2cc}
@media (orientation:portrait){#boot{flex-direction:column;text-align:center}}</style>
</head><body>
<div id="boot" role="img" aria-label="Arachnotes is loading"><svg viewBox="0 0 1000 1000" preserveAspectRatio="xMaxYMin slice" aria-hidden="true"><g stroke="#2a312e" stroke-width="2" fill="none">${
  Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return `<line x1="1000" y1="0" x2="${(1000 + Math.cos(a) * 1600).toFixed(0)}" y2="${(Math.sin(a) * 1600).toFixed(0)}"/>`; }).join("")}${
  Array.from({ length: 12 }, (_, i) => `<circle cx="1000" cy="0" r="${90 + i * 110}"/>`).join("")}</g></svg>
<img src="icons/icon-512.png" alt=""><div><b>Arachnotes</b><span>A spider reads any text and spins it into study guides, flashcards and notes.</span></div></div>`;
const tail = `<script>(()=>{const b=document.getElementById("boot");if(!b)return;const go=()=>{b.classList.add("gone");setTimeout(()=>b.remove(),500)};const wait=Math.max(0,900-performance.now());setTimeout(go,wait)})();</script>
<script>if ("serviceWorker" in navigator && !window.Capacitor && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("sw.js"));</script>
</body></html>`;
// Release builds hide the app's code: comments are stripped, the CSS is squeezed, and every inline script is
// minified and obfuscated (renamed variables, encoded strings), so the code in the APK or the website is very
// slow to read or reuse. Set PLAIN_BUILD=1 for a readable build while debugging.
let html = head + page + tail;
if (process.env.PLAIN_BUILD !== "1") html = await protect(html);
writeFileSync(`${OUT}/index.html`, html);

async function protect(src) {
  const { default: JavaScriptObfuscator } = await import("javascript-obfuscator");
  const { transform } = await import("esbuild");
  const styles = [], scripts = [];
  // scripts first: their template strings contain <style> blocks and HTML of their own
  let out = src.replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => { scripts.push(js); return `<script>@@SCRIPT${scripts.length - 1}@@</script>`; });
  out = out.replace(/<!--(?!\[)[\s\S]*?-->/g, "");
  out = out.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => { styles.push(css); return `<style>@@STYLE${styles.length - 1}@@</style>`; });
  for (let i = 0; i < styles.length; i++) styles[i] = (await transform(styles[i], { loader: "css", minify: true })).code.trim();
  for (let i = 0; i < scripts.length; i++) {
    const min = (await transform(scripts[i], { loader: "js", minify: true, target: "es2020" })).code;
    scripts[i] = min.length < 2000 ? min : JavaScriptObfuscator.obfuscate(min, {
      compact: true, simplify: true, identifierNamesGenerator: "mangled-shuffled", renameGlobals: false,
      stringArray: true, stringArrayEncoding: ["base64"], stringArrayThreshold: 0.6, stringArrayRotate: true, stringArrayShuffle: true,
      splitStrings: false, controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, transformObjectKeys: false,
      unicodeEscapeSequence: false, sourceMap: false, target: "browser"
    }).getObfuscatedCode();
  }
  // a function as the replacement so "$&" and friends in the code are left alone
  out = out.replace(/@@STYLE(\d+)@@/g, (m, i) => styles[+i]).replace(/@@SCRIPT(\d+)@@/g, (m, i) => scripts[+i]);
  return out.replace(/\n\s*\n+/g, "\n");
}

// Default AI for this deployment, from environment variables (GitHub repository variables in CI).
// Never put an API key here: everything in config.js is public. Point CRAWLER_AI_BASE_URL at a proxy
// that holds the key instead (see proxy/ and the wiki).
const ai = {
  provider: process.env.CRAWLER_AI_PROVIDER || "",
  baseUrl: process.env.CRAWLER_AI_BASE_URL || "",
  model: process.env.CRAWLER_AI_MODEL || ""
};
// Paid packs stay unlocked until CRAWLER_LOCK_PAID=1 (turn it on for the Play release and the public website).
// CRAWLER_PLAY_URL is the Google Play listing that the web version's store links to.
const lockPaid = process.env.CRAWLER_LOCK_PAID === "1", playUrl = process.env.CRAWLER_PLAY_URL || "";
// The public website: the app points people to its /connect page to set up Ollama on their computer.
const siteUrl = (process.env.CRAWLER_SITE_URL || "https://arachnotes.vercel.app/").replace(/\/?$/, "/");
// the Arachnotes website (download, Issues and Ideas forum, privacy policy, terms)
const website = (process.env.CRAWLER_WEBSITE || "https://arachnotes-web.vercel.app/").replace(/\/?$/, "/");
// the free browser version's upload limit per browser; 0 (the default, used for Android and tests) means no limit
const webUploads = Math.max(0, Math.floor(+process.env.CRAWLER_WEB_UPLOADS || 0));
// Issue reports and per-user fixes (Supabase). The publishable key is meant to be public: with it the app can
// only call the report_issue and get_fix functions, and can't read anyone's reports.
const support = {
  url: process.env.CRAWLER_SUPPORT_URL || "https://gepkziwvlczkwernhtjm.supabase.co",
  key: process.env.CRAWLER_SUPPORT_KEY || "sb_publishable_xMcywbR7DxLl_Ygy_yxPdQ_UbF3HOzd"
};
writeFileSync(`${OUT}/config.js`, `window.CRAWLER_CONFIG = ${JSON.stringify({ ai, vendor: "vendor/", lockPaid, playUrl, siteUrl, website, webUploads, support, version: pkg.version }, null, 2)};\n`);

// The computer setup page and scripts. Ollama always accepts the Android app (https://localhost); these
// website origins are added so the website can use Ollama on the same computer too.
const origins = [...new Set([new URL(siteUrl).origin, "https://arachnotes.vercel.app", "https://cak3d-crawler.vercel.app", "https://real-cak3d.github.io", ...(process.env.CRAWLER_SITE_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean)])].join(",");
mkdirSync(`${OUT}/connect`, { recursive: true });
for (const name of readdirSync("web/connect")) {
  let t = readFileSync(`web/connect/${name}`, "utf8").split("__SITE__").join(siteUrl).split("__ORIGINS__").join(origins).replace(/\r\n/g, "\n");
  if (name.endsWith(".bat")) t = t.replace(/\n/g, "\r\n"); // Windows batch files need Windows line endings
  writeFileSync(`${OUT}/connect/${name}`, t);
}

copyFileSync("web/manifest.webmanifest", `${OUT}/manifest.webmanifest`);
copyFileSync("web/privacy.html", `${OUT}/privacy.html`);
writeFileSync(`${OUT}/sw.js`, readFileSync("web/sw.js", "utf8").replace("__VERSION__", `${pkg.version}-${Date.now()}`));
for (const f of readdirSync("web/icons")) copyFileSync(`web/icons/${f}`, `${OUT}/icons/${f}`);
console.log(`Built ${OUT}/ (version ${pkg.version})`);
