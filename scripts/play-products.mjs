// Writes play-products.csv: every paid item, preset and bundle from the app's #storeCatalog, in the format the
// Google Play Console imports for in-app products (Monetize → Products → In-app products → Import).
// Prices are in US dollars; Play fills in other countries' prices from them (Auto Fill Prices).
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("src/cak3d-crawler.html", "utf8");
const json = html.match(/<script type="application\/json" id="storeCatalog">([\s\S]*?)<\/script>/);
if (!json) { console.error("No #storeCatalog block in src/cak3d-crawler.html"); process.exit(1); }
const catalog = JSON.parse(json[1]);

// Play's import file separates locale, title and description with semicolons inside one column,
// so those characters can't appear in the text itself.
const clean = (t, max) => String(t || "").replace(/,/g, " ·").replace(/[;"\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const micros = price => String(Math.round(parseFloat(price) * 1e6));

const rows = [];
const add = (id, title, desc, price) => {
  if (!/^[a-z0-9][a-z0-9_.]*$/.test(id)) throw new Error(`Product id "${id}" isn't allowed by Google Play`);
  rows.push([id, "published", "managed_by_android", "false", `en_US; ${clean(title, 55)}; ${clean(desc || title, 200)}`, "true", micros(price), ""]);
};
for (const g of catalog.groups) for (const it of g.items) add(it.id, it.name, it.desc || `${it.name} for your spider. ${g.name}.`, it.price);
for (const p of catalog.presets) add(p.id, p.name, `A whole style in one tap. Also unlocks every item it uses.`, p.price);
for (const b of catalog.bundles) add(b.id, b.name, b.desc, b.price);

const ids = rows.map(r => r[0]);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) throw new Error("Duplicate product ids: " + dupes.join(", "));

const header = "Product ID,Published State,Purchase Type,Auto Translate,Locale; Title; Description,Auto Fill Prices,Price,Pricing Template ID";
writeFileSync("play-products.csv", [header, ...rows.map(r => r.join(","))].join("\n") + "\n");
const total = rows.filter(r => !r[0].startsWith("bundle_")).reduce((t, r) => t + +r[6] / 1e6, 0);
console.log(`Wrote play-products.csv: ${rows.length} products (items, presets and bundles), $${total.toFixed(2)} if every one were bought separately.`);
