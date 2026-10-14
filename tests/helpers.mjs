import { expect } from "@playwright/test";

// fast spider, no first-visit surprises
export async function openApp(page, cfg = {}) {
  await page.addInitScript(c => { try { localStorage.setItem("cak3d-cfg", JSON.stringify({ speed: 4, ...c })); } catch (e) { /* storage blocked */ } }, cfg);
  await page.goto("/");
  await expect(page.locator("#page")).toBeVisible();
}

// waits until every keyword in the sample is crawled
export async function crawlDone(page) {
  await expect.poll(async () => {
    const [a, b] = await Promise.all([page.locator("#sCrawled").textContent(), page.locator("#sTotal").textContent()]);
    return +a > 0 && a === b;
  }, { timeout: 100_000, intervals: [500] }).toBe(true);
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
