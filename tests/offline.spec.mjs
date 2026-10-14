import { test, expect } from "@playwright/test";
import { openApp, crawlDone, tool } from "./helpers.mjs";

// A short text with clear topics: bees, honey making, and beekeeping
const TEXT = `Honey bees live in large colonies. Each colony has one queen, thousands of female worker bees, and a few hundred male drones.
The queen lays all the eggs in the colony. She can lay more than a thousand eggs a day in the wax cells of the comb.
Worker bees collect nectar and pollen from flowers. Back in the hive they turn the nectar into honey and store it in the wax comb.
Honey is made when worker bees fan the nectar with their wings until most of the water evaporates. Bees eat honey through the winter.
Pollen gives bees protein. While collecting pollen, bees carry it from flower to flower, and this pollination helps plants make seeds and fruit.
Beekeepers keep colonies in wooden hives. A beekeeper wears a veil and uses smoke to calm the bees before taking honey and wax from the hive.
Drones exist to mate with a queen from another colony. They do not collect nectar or pollen and are pushed out of the hive in autumn.`;

test("with no internet and no AI, the spider reads a text, finds its keywords and topics, links them, and answers questions", async ({ page, context }) => {
  // block every request that isn't the app itself
  await context.route(url => !/^http:\/\/127\.0\.0\.1:4173\//.test(url.href), route => route.abort());
  await openApp(page);
  await tool(page, "bSource");
  await page.locator("#srcTextR").check();
  await page.locator("#srcText").fill(TEXT);
  await page.locator("#srcGo").click();
  await expect(page.locator("#page")).toContainText("Beekeepers keep colonies");
  await crawlDone(page);
  // keywords and topics
  expect(+(await page.locator("#sTotal").textContent())).toBeGreaterThanOrEqual(8);
  expect(+(await page.locator("#sGrips").textContent())).toBeGreaterThanOrEqual(2);
  expect(+(await page.locator("#sThreads").textContent())).toBeGreaterThan(0);
  const words = (await page.locator("#page .kw").allTextContents()).map(w => w.toLowerCase());
  for (const w of ["queen", "pollen", "honey", "drones"]) expect(words.some(x => x.includes(w))).toBe(true);
  // the web view links them together
  await page.locator("#bWeb").click();
  await expect(page.locator("#wv")).toBeVisible();
  await page.keyboard.press("Escape");
  // a question is answered with the passages that answer it
  await tool(page, "bAsk");
  await page.locator("#askQ").fill("What do worker bees collect?");
  await page.locator("#askGo").click();
  await expect(page.locator("#askPassages li").first()).toContainText(/nectar|pollen/i);
  await page.locator("#askQ").fill("How do beekeepers calm the bees?");
  await page.locator("#askGo").click();
  await expect(page.locator("#askPassages li").first()).toContainText(/smoke/i);
});

test("with an AI key set up, the AI writes a cited answer from the passages", async ({ page }) => {
  let sent = "";
  await page.route("https://api.openai.com/v1/chat/completions", route => {
    sent = route.request().postData() || "";
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "Worker bees collect nectar and pollen from flowers [1]." } }] })}\n\ndata: [DONE]\n\n`;
    route.fulfill({ headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: sse });
  });
  await page.addInitScript(() => localStorage.setItem("cak3d-ai", JSON.stringify({ service: "openai", provider: "openai", base: "https://api.openai.com/v1", key: "sk-test", model: "gpt-test" })));
  await openApp(page);
  await tool(page, "bSource");
  await page.locator("#srcTextR").check();
  await page.locator("#srcText").fill(TEXT);
  await page.locator("#srcGo").click();
  await crawlDone(page);
  await tool(page, "bAsk");
  await page.locator("#askQ").fill("What do worker bees collect?");
  await page.locator("#askGo").click();
  await expect(page.locator("#askAnswer")).toContainText("Worker bees collect nectar and pollen");
  // the AI was given the question and the matching passages, with the key
  expect(sent).toContain("What do worker bees collect?");
  expect(sent).toMatch(/nectar/);
});
