// v1.18: the web version's limit counted on the server too, link codes from the Android app, and moving data
// between devices with a one-time code
import { test, expect } from "@playwright/test";
import { openApp, tool, fakeServer } from "./helpers.mjs";

const watch = page => { const errs = []; page.on("pageerror", e => errs.push(e.message)); return errs; };
const TEXT = "Orb weavers spin wheel-shaped webs from silk. The silk comes from spinnerets at the back of the spider. ".repeat(3) +
  "Spider silk is stronger than steel of the same weight. Orb weavers rebuild their webs every night and eat the old silk. ".repeat(2);
const webVersion = page => page.route("**/config.js", async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/"webUploads": \d+/, '"webUploads": 2') }); });
async function loadText(page, text = TEXT, title = "Silk notes") {
  await tool(page, "bSource");
  await page.locator("#srcTextR").check();
  await page.locator("#srcText").fill(text);
  await page.locator("#srcTitle").fill(title);
  await page.locator("#srcGo").click();
}
const openDevices = async page => { await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="devices"]').click(); };

test("another browser on the same network can't start over: the server's count of free uses counts too", async ({ page }) => {
  await webVersion(page);
  const S = await fakeServer(page);
  S.used = 2; // this network already used them, in a private window say
  await openApp(page);
  await expect.poll(() => S.calls.includes("web_quota")).toBe(true);
  await loadText(page);
  await expect(page.locator("#dLimit")).toBeVisible();
  await expect(page.locator("#limMsg")).toContainText("link code");
});

test("a link code from the Android app lifts the limit and unlocks purchases, and the browser can be unlinked", async ({ page }) => {
  const errs = watch(page);
  await page.route("**/config.js", async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/"webUploads": \d+/, '"webUploads": 2').replace(/"lockPaid": \w+/, '"lockPaid": true') }); });
  const S = await fakeServer(page);
  S.used = 2;
  S.links.set("7K4MQ2XD9HPA", ["kind_orb"]);
  await openApp(page);
  await loadText(page);
  await expect(page.locator("#dLimit")).toBeVisible();
  // "I have the app" goes straight to Phone & web
  await page.locator("#limLink").click();
  await expect(page.locator("#linkWeb")).toBeVisible();
  await expect(page.locator("#linkApp")).toBeHidden();
  // a wrong code, then the right one
  await page.locator("#linkIn").fill("AAAA-BBBB-CCCC"); await page.locator("#linkGo").click();
  await expect(page.locator("#linkMsg")).toContainText("didn't work");
  await page.locator("#linkIn").fill("7k4m q2xd 9hpa"); await page.locator("#linkGo").click();
  await expect(page.locator("#linkMsg")).toContainText("1 purchase is unlocked");
  await expect(page.locator("#linkState")).toContainText("linked to your Android app");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cak3d-owned")))).toContain("kind_orb");
  await page.keyboard.press("Escape");
  // no limit now
  await page.locator("#srcCancel").click().catch(() => {});
  await loadText(page, TEXT, "Linked one");
  await expect(page.locator("#docTitle")).toHaveText("Linked one");
  await expect(page.locator("#dLimit")).toBeHidden();
  // still linked after a reload (the pass is checked again), and backups never carry the pass
  await page.reload();
  await expect.poll(() => S.calls.filter(c => c === "web_quota").length).toBeGreaterThan(1);
  await openDevices(page);
  await expect(page.locator("#linkOff")).toBeVisible();
  await page.locator("#linkOff").click();
  await expect(page.locator("#linkMsg")).toContainText("Unlinked");
  expect(await page.evaluate(() => [localStorage.getItem("cak3d-pass"), JSON.parse(localStorage.getItem("cak3d-owned"))])).toEqual([null, []]);
  // the code worked once
  await page.locator("#linkIn").fill("7K4M-Q2XD-9HPA"); await page.locator("#linkGo").click();
  await expect(page.locator("#linkMsg")).toContainText("didn't work");
  expect(errs).toEqual([]);
});

test("moving data to another device with a one-time code: everything, or chosen crawls and parts", async ({ browser }) => {
  const S = { used: 0, links: new Map(), passes: new Map(), transfers: new Map(), calls: [] };
  const phone = await (await browser.newContext()).newPage(), web = await (await browser.newContext()).newPage();
  const errs = [...[phone, web].map(watch)];
  for (const p of [phone, web]) await fakeServer(p, S);
  await openApp(phone, { startWith: "blank" });
  await loadText(phone, TEXT, "Silk notes");
  await expect(phone.locator("#docTitle")).toHaveText("Silk notes");
  // send everything (the crawl that's open isn't saved yet, and comes too)
  await openDevices(phone);
  await phone.locator("#xferMake").click();
  await expect(phone.locator("#xferOut")).toBeVisible({ timeout: 20_000 });
  const code = await phone.locator("#xferCode").textContent();
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
  await expect(phone.locator("#xferMsg")).toContainText("1 crawl");
  // what the server holds is locked: none of the text is readable
  const stored = [...S.transfers.values()][0];
  expect(stored).toMatch(/^v1\./);
  expect(stored).not.toContain("silk");
  // the other device picks it up once
  await openApp(web, { startWith: "blank" });
  await openDevices(web);
  await web.locator("#xferIn").fill(code.toLowerCase());
  await web.locator("#xferGo").click();
  await expect(web.locator("#xferMsg")).toContainText("added 1 crawl to your library", { timeout: 20_000 });
  expect(await web.evaluate(() => JSON.parse(localStorage.getItem("cak3d-lib")).map(m => m.title))).toEqual(["Silk notes"]);
  await web.locator("#xferIn").fill(code); await web.locator("#xferGo").click();
  await expect(web.locator("#xferMsg")).toContainText("didn't work");
  expect(S.transfers.size).toBe(0);
  // choosing crawls and parts: only the ticked crawl, and the other device adds to the copy it already has
  await phone.locator('input[name="xferWhat"][value="pick"]').check();
  await expect(phone.locator("#xferPick")).toContainText("Silk notes");
  await phone.locator("#xNotes").uncheck(); await phone.locator("#xCards").uncheck();
  await phone.locator("#xferMake").click();
  await expect(phone.locator("#xferMsg")).toContainText("1 crawl");
  const code2 = await phone.locator("#xferCode").textContent();
  expect(code2).not.toBe(code);
  await web.locator("#xferIn").fill(code2); await web.locator("#xferGo").click();
  await expect(web.locator("#xferMsg")).toContainText("added to 1 crawl you already had");
  expect(await web.evaluate(() => JSON.parse(localStorage.getItem("cak3d-lib")).length)).toBe(1);
  // nothing chosen, nothing sent
  await phone.locator("#xferPick input").first().uncheck();
  await phone.locator("#xferMake").click();
  await expect(phone.locator("#xferMsg")).toContainText("Choose at least one crawl");
  expect(errs.flat()).toEqual([]);
});

test("Phone & web fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await webVersion(page); await fakeServer(page);
  await openApp(page);
  await openDevices(page);
  await expect(page.locator("#xferBox")).toBeVisible();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll("#dSettings section[data-g=devices] *")].some(e => e.getBoundingClientRect().right > innerWidth + 1));
  expect(wide).toBe(false);
});

test("the owner's dashboard: hidden behind 7 taps, needs the passphrase, shows every service and messages", async ({ page }) => {
  const errs = watch(page);
  const msgs = [];
  await page.route("**/functions/v1/dev", async r => {
    const b = r.request().postDataJSON(), ok = j => r.fulfill({ contentType: "application/json", body: JSON.stringify(j) });
    if (b.action === "signin") return b.passphrase === "spider silk" ? ok({ token: "t".repeat(64) }) : r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"That didn\'t work."}' });
    if (b.token !== "t".repeat(64)) return r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Signed out. Sign in again."}' });
    if (b.action === "stats") return ok({ at: new Date().toISOString(),
      supabase: { ok: true, db_bytes: 420 * 1048576, db_limit: 500 * 1048576, errors_day: 2, errors_week: 5, reports_week: 1, deletions_open: 0, top_errors: [{ message: "Boom", place: "animation", version: "1.18.0", count: 3 }], linked_browsers: 4, web_networks_week: 9, forum_posts: 3, link_codes_week: 2, transfers_waiting: 0 },
      github: { ok: true, private: false, workflows: [{ name: "Android release", status: "completed", conclusion: "success", url: "https://github.com/x", at: new Date().toISOString() }], releases: [{ tag: "v1.18.0", apk: 12 }], apk_total: 40 },
      vercel: { ok: false, error: "vercel answered 403" },
      play: { ok: true, installs: { active_devices: 120, total_users: 300, installs_month: 50, uninstalls_month: 5 }, rating: { average: 4.6 }, reviews_week: 2, reviews: [{ stars: 5, text: "Love the spider", at: new Date().toISOString() }], sales: { report: "salesreport_202610", orders: 7, by_currency: { USD: 6.93 }, top: [["bundle_everything", 3]] } } });
    if (b.action === "messages") return ok({ messages: msgs });
    if (b.action === "send") { msgs.push({ id: msgs.length + 1, at: new Date().toISOString(), sender: "owner", body: b.text }); return ok({ ok: true }); }
    if (b.action === "signout") return ok({ ok: true });
  });
  await openApp(page);
  await page.locator("#bSettings").click(); await page.locator("#setHelp").click();
  for (let i = 0; i < 6; i++) await page.locator("#supLegal").click();
  await expect(page.locator("#dOwner")).toBeHidden(); // 6 taps aren't enough
  await page.locator("#supLegal").click();
  await expect(page.locator("#dOwner")).toBeVisible();
  await expect(page.locator("#ownIn")).toBeVisible();
  await page.locator("#ownPass").fill("wrong"); await page.locator("#ownGo").click();
  await expect(page.locator("#ownMsg")).toHaveText("That didn't work.");
  await page.locator("#ownPass").fill("spider silk"); await page.locator("#ownGo").click();
  await expect(page.locator("#ownBody")).toBeVisible();
  const grid = page.locator("#ownGrid");
  await expect(grid).toContainText("120"); // Android devices
  await expect(grid).toContainText("4.60★");
  await expect(grid).toContainText("6.93 USD");
  await expect(grid).toContainText("Boom");
  await expect(grid.locator(".own-bar.bad, .own-bar.warn").first()).toContainText("Database"); // 84%: getting close
  await expect(grid).toContainText("vercel answered 403"); // a part that fails says why, the rest still shows
  await expect(grid.locator('a[href="https://play.google.com/console"]').first()).toBeVisible();
  await page.locator("#ownText").fill("The crawl froze on my phone");
  await page.locator("#ownSend").click();
  await expect(page.locator("#ownThread")).toContainText("The crawl froze on my phone");
  // it stays signed in, and backups never carry the sign-in
  expect(await page.evaluate(() => localStorage.getItem("cak3d-owner"))).toBeTruthy();
  await page.locator("#ownOut").click();
  await expect(page.locator("#ownIn")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cak3d-owner"))).toBeNull();
  expect(errs).toEqual([]);
});
