import { expect } from "@playwright/test";

// fast spider, no first-visit surprises
export async function openApp(page, cfg = {}) {
  await page.addInitScript(c => { try { localStorage.setItem("cak3d-cfg", JSON.stringify({ speed: 4, tourDone: true, lookup: "off", ...c })); } catch (e) { /* storage blocked */ } }, cfg);
  await page.goto("/");
  await expect(page.locator("#page")).toBeVisible();
}

// waits until every keyword in the guide is crawled (the guide is long, so allow for a slow machine)
export async function crawlDone(page) {
  await expect.poll(async () => {
    const [a, b] = await Promise.all([page.locator("#sCrawled").textContent(), page.locator("#sTotal").textContent()]);
    return +a > 0 && a === b;
  }, { timeout: 200_000, intervals: [500] }).toBe(true);
}

// a small text PDF, one page per string, built by hand so the tests need no fixtures
export function makePdf(pages) {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids = [];
  for (const text of pages) {
    const lines = text.match(/.{1,70}(\s|$)/g).map(l => l.trim().replace(/[()\\]/g, "\\$&"));
    const stream = "BT /F1 12 Tf 50 750 Td 16 TL " + lines.map(l => `(${l}) Tj T*`).join(" ") + " ET";
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objs.length} 0 R >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const at = objs.map((o, i) => { const pos = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return pos; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map(p => String(p).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// Toolbar actions live in menus (Spider, Ask, Pages) or in Settings (Theme, Live stats): open the right place, then click
export async function tool(page, id) {
  const where = await page.locator("#" + id).evaluate(el => {
    const m = el.closest(".tb-menu"); if (m) return { menu: m.getAttribute("aria-labelledby") };
    if (el.closest("#dSettings")) return { settings: true };
    return {};
  });
  if (where.menu) await page.locator("#" + where.menu).click();
  if (where.settings && !(await page.locator("#dSettings").isVisible())) await page.locator("#bSettings").click();
  await page.locator("#" + id).click();
}

// a stand-in for the server functions behind the web app's use limit, link codes and transfers, so tests never touch the
// real database. Pass the same state to several pages to move data between them.
export async function fakeServer(page, S = { used: 0, links: new Map(), passes: new Map(), transfers: new Map(), calls: [] }) {
  const norm = c => String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  await page.route("**/rest/v1/rpc/*", async r => {
    const fn = r.request().url().split("/rpc/")[1].split("?")[0], b = r.request().postDataJSON() || {};
    S.calls.push(fn);
    const ok = j => r.fulfill({ contentType: "application/json", body: JSON.stringify(j) });
    if (fn === "web_quota") return ok(S.passes.has(b.p_pass) ? { linked: true, owned: S.passes.get(b.p_pass) } : { linked: false, used: S.used });
    if (fn === "web_spend") { S.used += b.p_n || 1; return ok({ linked: false, used: S.used }); }
    if (fn === "link_redeem") {
      const k = norm(b.p_code);
      if (!S.links.has(k)) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "That code didn't work. Codes work once and for 30 minutes, so make a new one in the app." }) });
      const owned = S.links.get(k); S.links.delete(k);
      const pass = "a".repeat(40) + S.passes.size; S.passes.set(pass, owned);
      return ok({ pass, owned });
    }
    if (fn === "transfer_put") { S.transfers.set(b.p_id, b.p_data); return ok(null); }
    if (fn === "transfer_take") { const d = S.transfers.has(b.p_id) ? S.transfers.get(b.p_id) : null; S.transfers.delete(b.p_id); return ok(d); }
    return ok(null);
  });
  return S;
}
