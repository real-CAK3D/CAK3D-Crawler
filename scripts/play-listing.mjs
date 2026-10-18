// Sends the store listing in store-listing/ to Google Play: the name, short and full description from listing.md,
// and (with --images) the icon, feature graphic and screenshots. Run by the "Play listing" workflow, which passes the
// service account key from the PLAY_SERVICE_ACCOUNT_JSON secret; the key never leaves GitHub's runner.
//   node scripts/play-listing.mjs [--images] [--dry-run]
import { readFileSync, readdirSync } from "node:fs";
import { createSign } from "node:crypto";

const PKG = "com.arachnotes.web", LANG = process.env.PLAY_LANG || "en-US", DIR = "store-listing";
const images = process.argv.includes("--images"), dry = process.argv.includes("--dry-run"), check = process.argv.includes("--check");

// listing.md: "## App name", "## Short description" and "## Full description" sections, up to the next heading
const md = readFileSync(`${DIR}/listing.md`, "utf8").replace(/\r\n/g, "\n");
const section = name => {
  const m = new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(md);
  if (!m) throw new Error(`listing.md has no "## ${name}" section`);
  return m[1].trim();
};
const listing = { language: LANG, title: section("App name"), shortDescription: section("Short description"), fullDescription: section("Full description") };
const video = (process.env.PLAY_VIDEO || "").trim();
if (video) listing.video = video;
for (const [k, max] of [["title", 30], ["shortDescription", 80], ["fullDescription", 4000]])
  if (listing[k].length > max) throw new Error(`${k} is ${listing[k].length} characters; Google Play allows ${max}`);

const files = readdirSync(DIR).sort();
const IMAGES = {
  icon: files.filter(f => f === "icon-512.png"),
  featureGraphic: files.filter(f => f.startsWith("feature-graphic")),
  phoneScreenshots: files.filter(f => /^phone-\d+.*\.png$/.test(f)),
  sevenInchScreenshots: files.filter(f => /^tablet-\d+.*\.png$/.test(f)),
  tenInchScreenshots: files.filter(f => /^tablet-\d+.*\.png$/.test(f)),
};

console.log(`Listing (${LANG}): "${listing.title}" · short ${listing.shortDescription.length}/80 · full ${listing.fullDescription.length}/4000${video ? " · video" : ""}`);
if (images) for (const [t, f] of Object.entries(IMAGES)) console.log(`  ${t}: ${f.join(", ") || "(none)"}`);
if (dry) process.exit(0);

// a short-lived access token from the service account key (a signed JWT, no extra packages)
const key = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON || "null");
if (!key || !key.client_email || !key.private_key) throw new Error("PLAY_SERVICE_ACCOUNT_JSON isn't set");
const b64 = x => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const claim = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: key.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
const jwt = claim + "." + createSign("RSA-SHA256").update(claim).sign(key.private_key, "base64url");
const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) })).json();
if (!tok.access_token) throw new Error("Google didn't accept the service account: " + (tok.error_description || tok.error || "unknown error"));

const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/edits`;
async function call(method, url, body, type = "application/json") {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${tok.access_token}`, ...(body ? { "content-type": type } : {}) }, body: body && type === "application/json" ? JSON.stringify(body) : body });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(API, "…")}: ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

// everything goes into one edit, which Google applies all at once when it's committed
const edit = await call("POST", API);
const E = `${API}/${edit.id}`;
if (check) { // only looks: reads the live listing, then throws the edit away
  const now = await call("GET", `${E}/listings/${LANG}`);
  await call("DELETE", E);
  console.log(`Connected to Google Play. The live listing is "${now.title}" (${(now.fullDescription || "").length} characters). Nothing was changed.`);
  process.exit(0);
}
await call("PUT", `${E}/listings/${LANG}`, listing);
console.log("Text updated");
if (images) for (const [type, list] of Object.entries(IMAGES)) {
  if (!list.length) continue;
  await call("DELETE", `${E}/listings/${LANG}/${type}`);
  for (const f of list) await call("POST", `${E.replace("/androidpublisher/v3/", "/upload/androidpublisher/v3/")}/listings/${LANG}/${type}?uploadType=media`, readFileSync(`${DIR}/${f}`), "image/png");
  console.log(`${type}: ${list.length} uploaded`);
}
await call("POST", `${E}:commit`);
console.log("Committed. Google reviews listing changes before they go live.");
