// Real internet, no stand-ins: Wikipedia, an ordinary website, web search and GitHub.
// Runs only when asked (LIVE=1 npx playwright test live), since it depends on those sites.
import { test, expect } from "@playwright/test";
import { openApp, crawlDone, tool } from "./helpers.mjs";

test.skip(!process.env.LIVE, "set LIVE=1 to run against the real internet");
test.describe.configure({ timeout: 240_000 });
const watch = page => { const errs = []; page.on("pageerror", e => errs.push(e.message)); return errs; };
async function loadLink(page, url) {
  await tool(page, "bSource"); await page.locator("#srcUrlR").check(); await page.locator("#srcUrl").fill(url); await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden({ timeout: 90_000 });
}

test("a real Wikipedia article: text, keywords, topics, and its pictures with credits", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await loadLink(page, "https://en.wikipedia.org/wiki/Honey_bee");
  await expect(page.locator("#docTitle")).toHaveText("Honey bee");
  await crawlDone(page);
  expect(+(await page.locator("#sTotal").textContent())).toBeGreaterThan(20);
  await page.locator("#bWeb").click();
  await page.locator('#wvTabs [data-tab="media"]').click();
  const cards = page.locator("#pMedia .md-card");
  expect(await cards.count()).toBeGreaterThan(3);
  await expect(page.locator("#pMedia .md-cite").first()).toContainText(/License|commons\.wikimedia\.org/);
  // the pictures really load
  await expect.poll(async () => page.locator("#pMedia img").evaluateAll(imgs => imgs.filter(i => i.complete && i.naturalWidth > 0).length), { timeout: 30_000 }).toBeGreaterThan(2);
  expect(errs).toEqual([]);
});

test("a real ordinary website through the reader", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await loadLink(page, "https://www.gutenberg.org/files/2701/2701-h/2701-h.htm");
  await crawlDone(page);
  expect(+(await page.locator("#sTotal").textContent())).toBeGreaterThan(10);
  expect(errs).toEqual([]);
});

test("a real web search finds pages to crawl", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await tool(page, "bSource"); await page.locator("#srcSearchR").check();
  await page.locator("#webQ").fill("spider silk proteins"); await page.locator("#webGo").click();
  await expect(page.locator("#webResults [data-res]").first()).toBeVisible({ timeout: 60_000 });
  await page.locator("#webResults [data-res]").first().check();
  await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden({ timeout: 90_000 });
  await crawlDone(page);
  expect(errs).toEqual([]);
});

test("a real GitHub project in the code reader", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await tool(page, "bCode");
  await page.locator("#cdOpen").click(); await page.locator("#cdGitBtn").click();
  await page.locator("#cdGitUrl").fill("https://github.com/real-CAK3D/CAK3D-Crawler/tree/main/scripts");
  await page.locator("#cdGitGo").click();
  await expect(page.locator("#dCodeGit")).toBeHidden({ timeout: 60_000 });
  await expect(page.locator("#cdSide")).toContainText("real-CAK3D/CAK3D-Crawler");
  await page.locator('#cdTabs [data-cdt="docs"]').click();
  await expect(page.locator("#cdDocs")).toContainText("protect"); // a function in scripts/build-web.mjs
  expect(errs).toEqual([]);
});

test("the guide's Try it buttons crawl real pages and real code", async ({ page }) => {
  const errs = watch(page);
  await openApp(page);
  await page.mouse.wheel(0, 10); // scrolling yourself stops the page following the spider
  await page.locator('#page [data-try="wiki"]').click();
  await expect(page.locator("#docTitle")).toHaveText("Orb-weaver spider", { timeout: 90_000 });
  await tool(page, "bSource"); await page.locator("#srcSample").check(); await page.locator("#srcGo").click();
  await page.mouse.wheel(0, 10); await page.locator('#page [data-try="page"]').click();
  await expect(page.locator("#docTitle")).toContainText("Spider", { timeout: 120_000 });
  await tool(page, "bSource"); await page.locator("#srcSample").check(); await page.locator("#srcGo").click();
  await page.mouse.wheel(0, 10); await page.locator('#page [data-try="code"]').click();
  await expect(page.locator("#cdSide")).toContainText("expressjs/express", { timeout: 60_000 });
  expect(errs).toEqual([]);
});

test("the free on-device AI downloads, answers, and works with the network off", async ({ page, context }) => {
  test.setTimeout(1_200_000);
  const errs = watch(page);
  await openApp(page);
  await page.locator("#bSettings").click(); await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#aiService").selectOption("device");
  await page.locator("#aiDevModel").selectOption("small");
  if (await page.locator("#aiDevGet").isVisible()) {
    await page.locator("#aiDevGet").click();
    await expect(page.locator("#aiDevStatus")).toContainText("downloaded and ready", { timeout: 900_000 });
  }
  await page.locator("#aiSave").click();
  await page.locator("#aiTest").click();
  await expect(page.locator("#aiNote")).toContainText("It works", { timeout: 300_000 });
  console.log("on-device reply:", await page.locator("#aiNote").textContent());
  // offline: the model and its engine come from the browser's cache
  await page.keyboard.press("Escape");
  await context.setOffline(true);
  await tool(page, "bAsk"); await page.locator("#askQ").fill("What does the spider do with keywords?"); await page.locator("#askGo").click();
  await expect(page.locator("#askOut, #askAnswer, .answer").first()).not.toBeEmpty({ timeout: 300_000 });
  await context.setOffline(false);
  expect(errs).toEqual([]);
});
