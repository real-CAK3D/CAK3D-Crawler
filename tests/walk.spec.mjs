// Walks through every screen at phone and desktop size, light and dark, and report anything off:
// page errors, console errors, sideways overflow, and buttons pushed off screen.
import { test, expect } from "@playwright/test";
import { openApp, crawlDone, tool } from "./helpers.mjs";
const OUT = process.env.SHOTS;
const SIZES = [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 860 }]];
for (const [name, vp] of SIZES) for (const scheme of ["light", "dark"]) {
  test(`walk ${name} ${scheme}`, async ({ page }) => {
    test.setTimeout(300_000);
    const problems = [];
    page.on("pageerror", e => problems.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource|net::ERR/.test(m.text())) problems.push("console: " + m.text().slice(0, 160)); });
    await page.setViewportSize(vp);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "no-preference" });
    await openApp(page, { flies: 3, bored: "tricks" });
    const check = async label => {
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        const out = [], vw = innerWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
        const pg = document.querySelector("dialog.page[open], #dSettings[open]");
        if (pg && Math.abs(pg.getBoundingClientRect().width - vw) > 2) out.push(`${pg.id} is not full width (${Math.round(pg.getBoundingClientRect().width)} of ${vw})`);
        const open = document.querySelector("dialog[open]") || (!document.getElementById("storePage").hidden && document.getElementById("storePage")) || (!document.getElementById("wv").hidden && document.getElementById("wv"));
        const root = open || document.body;
        for (const el of root.querySelectorAll("button, select, input, a[href]")) {
          if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
          const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
          if (b.right > vw + 2 || b.left < -2) { const sc = el.closest("[class*=tabs], .st-row, .tbl, .glist, .wv-tools, .st-tabs, .orb-trail, pre"); if (!sc) out.push(`off-screen: ${el.tagName.toLowerCase()}#${el.id || ""}.${(el.className || "").toString().slice(0, 20)} "${(el.textContent || el.value || "").trim().slice(0, 24)}" ${Math.round(b.left)}..${Math.round(b.right)}`); }
        }
        return out;
      });
      for (const p of r) problems.push(`${label}: ${p}`);
      if (OUT) await page.screenshot({ path: `${OUT}/walk-${name}-${scheme}-${label}.png` });
    };
    await check("01-main");
    for (const m of ["mbSpider", "mbAsk", "mbPages"]) { await page.locator("#" + m).click(); await check("02-menu-" + m); await page.keyboard.press("Escape"); }
    await page.locator("#bSettings").click();
    for (const sel of ['[data-g="spider"]', '[data-g="moves"]', '[data-g="babies"]', '[data-p="webfx"]', '[data-g="fx"]', '[data-g="theme"]', '[data-g="research"]']) {
      await page.locator("#setTabs " + sel).first().click(); await check("03-settings-" + sel.replace(/\W/g, ""));
    }
    await page.locator("#setHelp").click(); await check("03-settings-support");
    await page.locator("#bStore").click(); await check("04-store");
    await page.locator(".st-card").first().click(); await check("04-store-sheet");
    await page.keyboard.press("Escape"); await page.locator("#stBack").click();
    await page.keyboard.press("Escape");
    await page.locator("#bHelp").click(); await check("05-help");
    for (const t of ["legend", "keys", "faq", "about"]) { await page.locator(`#helpTabs [data-h="${t}"]`).click(); await check("05-help-" + t); }
    await page.keyboard.press("Escape");
    await tool(page, "bSource"); await check("06-source"); await page.keyboard.press("Escape");
    await tool(page, "bLib"); await check("07-library"); await page.keyboard.press("Escape");
    await tool(page, "bAsk"); await page.locator("#askQ").fill("What is silk?"); await page.locator("#askGo").click(); await check("08-ask"); await page.keyboard.press("Escape");
    await crawlDone(page);
    await tool(page, "bGuide"); await check("09-guide"); await page.keyboard.press("Escape");
    await page.locator("#bWeb").click(); await page.waitForTimeout(1200); await check("10-web");
    for (const t of ["graph", "chart", "timeline", "compare", "cards"]) { await page.locator(`#wvTabs [data-tab="${t}"]`).click(); await page.waitForTimeout(800); await check("10-web-" + t); }
    await page.locator("#wvClose").click();
    await tool(page, "bFind"); await check("11-find"); await page.keyboard.press("Escape");
    await tool(page, "bCode"); await page.waitForTimeout(800); await check("12-code-map");
    for (const t of ["code", "docs"]) { await page.locator(`#cdTabs [data-cdt="${t}"]`).click(); await check("12-code-" + t); }
    await page.locator("#cdOpen").click(); await check("12-code-open"); await page.keyboard.press("Escape"); await page.locator("#cdBack").click();
    console.log(`\n=== ${name} ${scheme}: ${problems.length} problem(s)\n` + [...new Set(problems)].join("\n"));
    expect([...new Set(problems)]).toEqual([]);
  });
}
