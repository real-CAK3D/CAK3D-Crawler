import { test, expect } from "@playwright/test";
import { openApp, crawlDone } from "./helpers.mjs";

// every new look, bug, hunting style, web style and word effect runs without errors
const CASES = [
  { look: "lobster", skin: "lobster", bugLook: "moth", hunt: "pounce", webStyle: "funnel", catchFx: "letters", bored: "web" },
  { look: "classic", bugLook: "butterfly", hunt: "lasso", webStyle: "sheet", catchFx: "wrap", bored: "web" },
  { look: "cartoon", bugLook: "firefly", hunt: "ambush", webStyle: "tangle", catchFx: "pull", bored: "web" },
  { look: "robot", bugLook: "mixed", hunt: "chase", webStyle: "zigzag", catchFx: "all", bored: "both" },
  { look: "classic", bugLook: "ladybug", hunt: "pounce", bored: "edges" },
  { look: "classic", bugLook: "bee", hunt: "lasso", bored: "tricks" }
];
for (const c of CASES) {
  test(`spider: ${c.look}, ${c.bugLook}, ${c.hunt}, ${c.webStyle || "orb"}, bored ${c.bored}`, async ({ page }) => {
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await openApp(page, { flies: 4, ...c });
    await crawlDone(page);
    await page.waitForTimeout(9000); // long enough to get bored: hunt, spin its web, or walk the edges
    expect(errors).toEqual([]);
  });
}

test("sound settings switch on without errors", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await openApp(page, { sound: true, steps: true, ambience: "rain", music: "lofi", volume: 0.3 });
  await page.locator("#page").click({ position: { x: 10, y: 10 } }); // sound needs a tap first
  await page.waitForTimeout(1500);
  await page.locator("#bSettings").click();
  await page.locator('#setTabs [data-g="fx"]').click();
  for (const [id, v] of [["#cfgAmbience", "night"], ["#cfgMusic", "spooky"], ["#cfgAmbience", "fire"], ["#cfgMusic", "sea"], ["#cfgMusic", "off"], ["#cfgAmbience", "none"]]) {
    await page.locator(id).selectOption(v); await page.waitForTimeout(400);
  }
  await expect(page.locator("#oVolume")).toHaveText("30%");
  expect(errors).toEqual([]);
});

test("help has at least ten FAQ answers", async ({ page }) => {
  await openApp(page);
  await page.locator("#bHelp").click();
  await page.locator('#helpTabs [data-h="faq"]').click();
  expect(await page.locator("#helpFaq dt").count()).toBeGreaterThanOrEqual(10);
});

test("the loading screen shows the logo, then gets out of the way", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<div id="boot"[^>]*>[\s\S]*<img src="icons\/icon-512\.png"[\s\S]*Arachnotes/);
  await page.goto("/");
  await expect(page.locator("#boot")).toHaveCount(0, { timeout: 5000 });
});
