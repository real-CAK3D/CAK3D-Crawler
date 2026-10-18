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
  await openApp(page, { sound: true, steps: true, ambience: "rain", music: "mix", volume: 0.3 });
  await page.locator("#page").click({ position: { x: 10, y: 10 } }); // sound needs a tap first
  await page.waitForTimeout(1500);
  await page.locator("#bSettings").click();
  await page.locator('#setTabs [data-p="webfx"]').click();
  await page.locator('#setTabs [data-g="fx"]').click();
  for (const [id, v] of [["#cfgAmbience", "night"], ["#cfgMusic", "calm-piano"], ["#cfgAmbience", "fire"], ["#cfgMusic", "little-piano"], ["#cfgMusic", "off"], ["#cfgAmbience", "none"]]) {
    await page.locator(id).selectOption(v); await page.waitForTimeout(400);
  }
  await expect(page.locator("#oVolume")).toHaveText("30%");
  // every recording is there and decodes
  const lengths = await page.evaluate(async () => {
    const ac = new AudioContext(), out = {};
    for (const f of ["rain", "night", "fire", "contemplation", "calm-piano", "another-august", "little-piano"])
      out[f] = Math.round((await ac.decodeAudioData(await (await fetch(`sounds/${f}.mp3`)).arrayBuffer())).duration);
    return out;
  });
  for (const [f, sec] of Object.entries(lengths)) expect(sec, f).toBeGreaterThan(5);
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

test("the web: main topic in the middle, tap a keyword for its notes and its own web, then step back", async ({ page }) => {
  await openApp(page);
  await crawlDone(page);
  await page.locator("#bWeb").click();
  await expect(page.locator('#wvTabs [data-tab="orb"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#orbTrail button")).toHaveCount(1);
  // tap a cell on the web: the notes panel shows that keyword and a second web opens around it
  const box = await page.locator("#orbCanvas").boundingBox();
  await expect(async () => {
    await page.mouse.click(box.x + box.width / 2 + Math.min(box.width, box.height) * 0.16, box.y + box.height / 2 + 4);
    await expect(page.locator("#orbTrail button")).toHaveCount(2, { timeout: 1500 });
  }).toPass();
  await expect(page.locator("#wvSide .term")).toHaveText(await page.locator('#orbTrail button[aria-current="true"]').textContent());
  // a connected keyword in the notes opens the next web
  await page.locator("#wvSide .kwc").first().click();
  await expect(page.locator("#orbTrail button")).toHaveCount(3);
  // the trail goes back to the start
  await page.locator('#orbTrail [data-orb-to="0"]').click();
  await expect(page.locator("#orbTrail button")).toHaveCount(1);
});

test("Settings is a full page that doesn't change size between tabs", async ({ page }) => {
  await openApp(page);
  await page.locator("#bSettings").click();
  const size = async () => page.locator("#dSettings").evaluate(d => { const r = d.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  const vp = page.viewportSize(), first = await size();
  expect(first).toEqual([vp.width, vp.height]);
  for (const sel of [`#setTabs [data-g="moves"]`, `#setTabs [data-g="theme"]`, `#setTabs [data-p="webfx"]`, `#setTabs [data-g="fx"]`, `#setTabs [data-g="research"]`, "#setHelp"]) { await page.locator(sel).click(); expect(await size()).toEqual(first); }
  await page.locator("#setBack").click();
  await expect(page.locator("#dSettings")).toBeHidden();
});
