// v1.20: the owner's full dashboard (charts, support, forum, users, fixes, switches, releases), and every app
// following the owner's switches and announcement
import { test, expect } from "@playwright/test";
import { openApp, fakeServer } from "./helpers.mjs";

const watch = page => { const errs = []; page.on("pageerror", e => errs.push(e.message)); return errs; };
const webVersion = page => page.route("**/config.js", async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/"webUploads": \d+/, '"webUploads": 2') }); });
const openDevices = async page => { await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="devices"]').click(); };

test("the full dashboard: charts, support, forum, users, fixes, switches and releases", async ({ page }) => {
  const errs = watch(page), calls = [];
  const day = i => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), now = new Date().toISOString();
  await page.route("**/functions/v1/dev", async r => {
    const b = r.request().postDataJSON(), ok = j => r.fulfill({ contentType: "application/json", body: JSON.stringify(j) });
    calls.push(b);
    if (b.action === "signin") return ok({ token: "t".repeat(64) });
    if (b.action === "stats") return ok({ at: now, supabase: { ok: true, db_bytes: 1e7, db_limit: 5e8 }, vercel: { ok: true, note: "Add VERCEL_TOKEN to see deploys." },
      github: { ok: true, workflows: [{ id: 77, name: "Android release", status: "completed", conclusion: "failure", url: "https://github.com/x", at: now }], releases: [{ tag: "v1.19.1", apk: 3, url: "https://github.com/r", at: now }] },
      play: { ok: true, reviews: [{ id: "rev1", stars: 4, text: "Nice spider", author: "Sam", at: now, reply: "" }] },
      health: { ok: true, checks: [{ name: "Web app", ok: true, status: 200, ms: 120 }, { name: "Reader service (web pages)", ok: false, status: 503 }] } });
    if (b.action === "series") return ok({ series: Array.from({ length: 30 }, (_, i) => ({ day: day(i), active: i, active_android: i, active_web: 1, new_users: 1, errors: i % 3, reports: 0, forum: 1, link_codes: 0, web_networks: 2 })),
      lifetime: { users: 42, users_android: 30, users_web: 12, active_7: 20, active_30: 35, reports: 4, reports_open: 1, errors: 9, errors_open: 2, forum_posts: 5, forum_flagged: 1, deletions: 0, deletions_open: 0, web_networks: 60, versions_week: [{ version: "1.19.1", n: 18 }], counters: { link_codes: 7, linked_browsers: 5, transfers: 3 } } });
    if (b.action === "inbox") return ok({ reports: [{ id: 3, user_id: "AN-AAAA-BBBB-CCCC", created_at: now, app_version: "1.19.1", platform: "android", message: "Crawl froze", contact: "a@b.c", settings: { speed: 2 }, status: "new" }],
      errors: [{ id: 9, message: "Boom", place: "animation", version: "1.19.1", platform: "web", count: 4, last_at: now, stack: "at x", fixed_at: null, user_id: "AN-AAAA-BBBB-CCCC" }], deletions: [] });
    if (b.action === "forum") return ok({ posts: [{ id: 5, kind: "issue", title: "Web view blank", status: "open", votes: 3, reports: 1 }] });
    if (b.action === "forum_post") return ok({ post: { id: 5, kind: "issue", title: "Web view blank", body: "The web view is empty", author: "Kim", status: "open", votes: 3, reports: 1 }, replies: [] });
    if (b.action === "user") return ok({ user: { platform: "android", version: "1.19.1", first_at: now, last_at: now }, checkins: [{ day: day(29) }], reports: [], errors: [], passes: [{ created_at: now, last_seen: now, owned: [] }], links: [] });
    if (b.action === "fixes") return ok({ fixes: [], seen: [] });
    if (b.action === "config") return ok({ config: { switches: { lookups: true, links: true, transfers: true, deviceAI: true, errorReports: true }, announcement: null } });
    if (b.action === "messages") return ok({ messages: [] });
    return ok({ ok: true, removed: 1 });
  });
  await page.addInitScript(() => localStorage.setItem("cak3d-owner", JSON.stringify("t".repeat(64))));
  await openApp(page);
  await page.locator("#bSettings").click(); await page.locator("#setHelp").click();
  for (let i = 0; i < 7; i++) await page.locator("#supLegal").click();
  await expect(page.locator("#ownBody")).toBeVisible();
  const pane = t => page.locator(`#dOwner [data-opane="${t}"]`), tab = t => page.locator(`#ownTabs [data-otab="${t}"]`);
  await expect(pane("overview")).toContainText("Reader service");
  await expect(tab("support")).toContainText("3"); // 1 report + 2 errors still open
  // charts and lifetime numbers
  await tab("charts").click();
  await expect(pane("charts")).toContainText("42");
  await expect(pane("charts").locator("svg.own-chart").first()).toBeVisible();
  await pane("charts").locator('[data-days="90"]').click();
  await expect.poll(() => calls.some(c => c.action === "series" && c.days === 90)).toBe(true);
  // support: save a report, mark an error fixed, answer a review (it asks twice before posting)
  await tab("support").click();
  await expect(pane("support")).toContainText("Crawl froze");
  await pane("support").locator('[data-rep="3"] [data-status]').selectOption("done");
  await pane("support").locator('[data-rep="3"] [data-save]').click();
  await expect.poll(() => calls.some(c => c.action === "report_set" && c.status === "done")).toBe(true);
  await pane("support").locator('[data-err="9"] [data-fix]').click();
  await expect.poll(() => calls.some(c => c.action === "error_set" && c.fixed)).toBe(true);
  await pane("support").locator('[data-rev="rev1"] [data-revtext]').fill("Thank you!");
  await pane("support").locator('[data-rev="rev1"] [data-revsend]').click();
  expect(calls.some(c => c.action === "review_reply")).toBe(false);
  await pane("support").locator('[data-rev="rev1"] [data-revsend]').click();
  await expect.poll(() => calls.some(c => c.action === "review_reply" && c.text === "Thank you!")).toBe(true);
  // forum: open a post, change its status
  await tab("forum").click();
  await pane("forum").locator('[data-post="5"]').click();
  await pane("forum").locator("[data-fstatus]").selectOption("planned");
  await pane("forum").locator("[data-fsave]").click();
  await expect.poll(() => calls.some(c => c.action === "forum_set" && c.status === "planned")).toBe(true);
  // users: look one up, unlink their browsers
  await tab("users").click();
  await pane("users").locator("[data-uid]").fill("AN-AAAA-BBBB-CCCC"); await pane("users").locator("[data-ugo]").click();
  await expect(pane("users")).toContainText("Linked browsers");
  await pane("users").locator("[data-unlink]").click(); await pane("users").locator("[data-unlink]").click();
  await expect.poll(() => calls.some(c => c.action === "unlink")).toBe(true);
  // fixes: send one to everyone; switch link codes off; show an announcement
  await tab("fixes").click();
  await pane("fixes").locator("[data-fmsg]").fill("Update to get the fix");
  await pane("fixes").locator("[data-fsend]").click(); await pane("fixes").locator("[data-fsend]").click();
  await expect.poll(() => calls.find(c => c.action === "fix_send")).toMatchObject({ target: "everyone", actions: { message: "Update to get the fix" } });
  await pane("fixes").locator('[data-sw="links"]').uncheck();
  await pane("fixes").locator("[data-swsave]").click(); await pane("fixes").locator("[data-swsave]").click();
  await expect.poll(() => calls.find(c => c.action === "config_set" && c.key === "switches")).toMatchObject({ value: { links: false, lookups: true } });
  await pane("fixes").locator("[data-atext]").fill("Back soon");
  await pane("fixes").locator("[data-asave]").click(); await pane("fixes").locator("[data-asave]").click();
  await expect.poll(() => (calls.find(c => c.action === "config_set" && c.key === "announcement") || {}).value?.text).toBe("Back soon");
  // releases: re-run the failed build
  await tab("releases").click();
  await pane("releases").locator('[data-rerun="77"]').click(); await pane("releases").locator('[data-rerun="77"]').click();
  await expect.poll(() => calls.find(c => c.action === "release")).toMatchObject({ kind: "rerun", run: 77 });
  expect(errs).toEqual([]);
});

test("every app honors the owner's switches and shows the announcement", async ({ page }) => {
  const errs = watch(page);
  await webVersion(page); await fakeServer(page);
  // after fakeServer, so this answer wins for get_fix
  await page.route("**/rest/v1/rpc/get_fix", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ all: null, mine: null,
    config: { switches: { lookups: false, links: false, transfers: false, deviceAI: true, errorReports: true }, announcement: { id: "a1", text: "Link codes are paused for a fix", level: "warn" } } }) }));
  await openApp(page, { lookup: "open" });
  await expect(page.locator("#annBar")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#annText")).toHaveText("Link codes are paused for a fix");
  await page.locator("#annClose").click();
  await expect(page.locator("#annBar")).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cak3d-switches")).links)).toBe(false);
  await openDevices(page);
  await page.locator("#linkIn").fill("7K4M-Q2XD-9HPA"); await page.locator("#linkGo").click();
  await expect(page.locator("#linkMsg")).toContainText("paused");
  await page.locator("#xferMake").click();
  await expect(page.locator("#xferMsg")).toContainText("paused");
  // a dismissed announcement stays dismissed
  await page.reload();
  await page.waitForTimeout(3500);
  await expect(page.locator("#annBar")).toBeHidden();
  expect(errs).toEqual([]);
});
