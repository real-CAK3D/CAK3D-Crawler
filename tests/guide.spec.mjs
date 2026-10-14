import { test, expect } from "@playwright/test";
import { openApp, tool } from "./helpers.mjs";

const BOOK = `Chapter 1: The Honey Bee

The honey bee is a social insect that lives in colonies of up to 60,000 workers. A colony has one queen, thousands of workers and, in summer, a few hundred drones. Workers collect nectar and pollen from flowers. Nectar is a sugary liquid that bees turn into honey. Pollen is the protein food of the colony.

Chapter 2: Inside the Hive

The hive is built from wax that workers make in glands on their abdomen. Wax cells hold eggs, larvae, pollen and honey. The queen lays up to 2,000 eggs a day in spring. Brood is the name for the eggs, larvae and pupae in the hive. Workers keep the brood warm at about 35 degrees.

Chapter 3: Swarming

Swarming is how a colony reproduces. The old queen leaves with about half of the workers, and a new queen takes over the hive. Scout bees search for a new home and dance to share what they found. The waggle dance tells other bees the direction and distance to a site.`;

const GUIDE_JSON = JSON.stringify({
  overview: "The text explains how honey bee colonies live and reproduce [1].",
  sections: [{ summary: "Colonies have a queen, workers and drones [1].", points: ["Workers gather nectar and pollen [1]"] },
    { summary: "The hive is made of wax cells [2].", points: [] }, { summary: "Colonies reproduce by swarming [3].", points: [] }],
  questions: [{ q: "How does a colony reproduce?", a: "By swarming [3]." }]
});

async function loadBook(page) {
  await tool(page, "bSource");
  await page.locator("#srcTextR").check();
  await page.locator("#srcText").fill(BOOK);
  await page.locator("#srcTitle").fill("All About Bees");
  await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden();
  await expect(page.locator("#docTitle")).toHaveText("All About Bees");
}

test("a study guide follows the chapters, without an AI", async ({ page }) => {
  await openApp(page);
  await loadBook(page);
  await tool(page, "bGuide");
  const g = page.locator("#guideBody");
  await expect(g.locator("h3")).toContainText(["Overview", "Chapter 1: The Honey Bee", "Chapter 2: Inside the Hive", "Chapter 3: Swarming", "Glossary", "Practice questions"]);
  await expect(g).toContainText("Nectar is a sugary liquid"); // a definition in the glossary
  await expect(g.locator(".g-q li").first()).toContainText("Fill in the blank");
  const dl = page.waitForEvent("download");
  await page.locator("#guideMd").click();
  expect((await dl).suggestedFilename()).toBe("all-about-bees-study-guide.md");
});

test("a selected passage gets its own guide", async ({ page }) => {
  await openApp(page);
  await loadBook(page);
  await page.evaluate(() => {
    const p = [...document.querySelectorAll("#page p")].find(x => x.textContent.includes("Swarming is how"));
    const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await expect(page.locator("#hlBtn")).toContainText("Study guide for this selection");
  await page.locator("#hlBtn").click();
  await expect(page.locator("#guideH")).toHaveText("Study guide: your selection");
  await expect(page.locator("#guideBody")).toContainText("Swarming");
});

test("with an AI set up, it writes the summaries with citations", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cak3d-ai", JSON.stringify({ provider: "openai", base: "http://127.0.0.1:4173/mock/v1", model: "test", key: "k" })));
  await page.route("**/mock/v1/**", route => route.fulfill({
    headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
    body: `data: ${JSON.stringify({ choices: [{ delta: { content: GUIDE_JSON } }] })}\n\ndata: [DONE]\n\n`
  }));
  await openApp(page);
  await loadBook(page);
  await tool(page, "bGuide");
  await page.locator("#guideAi").click();
  await expect(page.locator("#guideBody")).toContainText("Colonies reproduce by swarming");
  await expect(page.locator("#guideBody .cite").first()).toBeVisible();
  await expect(page.locator("#guideMeta")).toContainText("summaries by");
});
