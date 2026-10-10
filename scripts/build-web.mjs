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

await build({
  stdin: { contents: 'import Anthropic from "@anthropic-ai/sdk"; window.AnthropicSDK = Anthropic;', resolveDir: ".", loader: "js" },
  bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020", outfile: `${OUT}/anthropic.js`, logLevel: "warning"
});

// the source page is named Silk Crawler (its claude.ai name); the released app is CAK3D Crawler
const page = readFileSync("src/silk-crawler.html", "utf8")
  .replace("<title>Silk Crawler</title>", "<title>CAK3D Crawler</title>")
  .replace('<div class="brand">Silk Crawler<small', '<div class="brand">CAK3D Crawler<small');
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
</head><body>`;
const tail = `<script>if ("serviceWorker" in navigator && !window.Capacitor && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("sw.js"));</script>
</body></html>`;
writeFileSync(`${OUT}/index.html`, head + page + tail);

// Default AI for this deployment, from environment variables (GitHub repository variables in CI).
// Never put an API key here: everything in config.js is public. Point CRAWLER_AI_BASE_URL at a proxy
// that holds the key instead (see proxy/ and the wiki).
const ai = {
  provider: process.env.CRAWLER_AI_PROVIDER || "",
  baseUrl: process.env.CRAWLER_AI_BASE_URL || "",
  model: process.env.CRAWLER_AI_MODEL || ""
};
writeFileSync(`${OUT}/config.js`, `window.CRAWLER_CONFIG = ${JSON.stringify({ ai }, null, 2)};\n`);

copyFileSync("web/manifest.webmanifest", `${OUT}/manifest.webmanifest`);
writeFileSync(`${OUT}/sw.js`, readFileSync("web/sw.js", "utf8").replace("__VERSION__", `${pkg.version}-${Date.now()}`));
for (const f of readdirSync("web/icons")) copyFileSync(`web/icons/${f}`, `${OUT}/icons/${f}`);
console.log(`Built ${OUT}/ (version ${pkg.version})`);
