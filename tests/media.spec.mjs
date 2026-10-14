import { test, expect } from "@playwright/test";
import { openApp, crawlDone, tool } from "./helpers.mjs";

// a news-style article with captioned pictures, a video, and an icon that should be ignored
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ARTICLE = `<!doctype html><html><head><title>Honey bees at work</title></head><body><article>
<h1>Honey bees at work</h1>
<p>Honey bees live in large colonies. Each colony has one queen, thousands of worker bees and a few hundred drones. The colony depends on the queen.</p>
<figure><img src="/img/queen.jpg" width="640" height="480" alt="A queen bee surrounded by worker bees"><figcaption>The queen is larger than the worker bees around her. <span class="credit">Photo: Ana Ruiz</span></figcaption></figure>
<p>Worker bees collect nectar and pollen from flowers. Back in the hive the worker bees turn the nectar into honey and store the honey in wax comb.</p>
<p>Pollen gives worker bees protein, and carrying pollen from flower to flower is how pollination happens. Pollination helps plants make seeds.</p>
<figure><img src="/img/pollen.jpg" width="640" height="480" alt="Pollen on a bee's legs"><figcaption>A worker bee with pollen on its legs.</figcaption></figure>
<p>Beekeepers keep colonies in wooden hives and use smoke to calm the bees before taking honey and wax. Drones mate with the queen and do not collect pollen or nectar.</p>
<img src="/img/site-logo.png" width="32" height="32" alt="logo">
<iframe src="https://www.youtube.com/embed/abcdefghijk" title="How bees make honey"></iframe>
<p>The queen lays eggs in wax cells. Honey and wax come from the hive, and the hive needs worker bees, drones and a queen to survive.</p>
</article></body></html>`;

async function routeArticle(page) {
  await page.route("https://bees.example/**", r => {
    const p = new URL(r.request().url()).pathname;
    if (p.startsWith("/img/")) return r.fulfill({ body: PNG, contentType: "image/png" });
    return r.fulfill({ body: ARTICLE, contentType: "text/html", headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("https://i.ytimg.com/**", r => r.fulfill({ body: PNG, contentType: "image/png" }));
}
async function loadLink(page, url) {
  await tool(page, "bSource");
  await page.locator("#srcUrlR").check();
  await page.locator("#srcUrl").fill(url);
  await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden({ timeout: 20000 });
}

test("pictures and videos from a page are kept, sorted into topics, and cited", async ({ page }) => {
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await routeArticle(page);
  await openApp(page);
  await loadLink(page, "https://bees.example/article");
  await crawlDone(page);
  await page.locator("#bWeb").click();
  await page.locator('#wvTabs [data-tab="media"]').click();
  const cards = page.locator("#pMedia .md-card");
  await expect(cards).toHaveCount(3); // two pictures and the video, not the logo
  await expect(page.locator("#pMedia")).toContainText("The queen is larger than the worker bees");
  await expect(page.locator("#pMedia")).not.toContainText("logo");
  // sorted by the keywords their captions mention
  const queenCard = cards.filter({ hasText: "The queen is larger" });
  await expect(queenCard.locator(".md-keys")).toContainText(/queen/i);
  // cited, with the photographer, in APA by default
  await expect(queenCard.locator(".md-cite")).toContainText("Ana Ruiz. (n.d.). The queen is larger than the worker bees around her. [Image]");
  await expect(queenCard.locator(".md-cite")).toContainText("[Image]");
  const video = cards.filter({ hasText: "How bees make honey" });
  await expect(video.locator(".md-pic")).toHaveClass(/video/);
  await expect(video.locator(".md-cite")).toContainText("[Video]");
  // a keyword's notes show its pictures
  await queenCard.locator(".md-keys .chip").first().click();
  await expect(page.locator("#wvSide")).toContainText("Pictures and videos");
  await expect(page.locator("#wvSide .md-card").first()).toBeVisible();
  expect(errs).toEqual([]);
});

test("pictures show up in the study guide and the saved notes", async ({ page }) => {
  await routeArticle(page);
  await openApp(page);
  await loadLink(page, "https://bees.example/article");
  await crawlDone(page);
  await tool(page, "bGuide");
  await expect(page.locator("#guideBody")).toContainText("Pictures and videos");
  await expect(page.locator("#guideBody .md-card").first()).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#guideMd").click()]);
  const md = await (await dl.createReadStream()).toArray().then(c => Buffer.concat(c).toString());
  expect(md).toContain("## Pictures and videos");
  expect(md).toMatch(/!\[The queen is larger[^\]]*\]\(https:\/\/bees\.example\/img\/queen\.jpg\)/);
});

test("Wikipedia pictures come with the author and license", async ({ page }) => {
  const text = "The honey bee is a social insect. Honey bees live in colonies with a queen, workers and drones. ".repeat(4) +
    "Worker bees gather nectar and pollen. Pollen feeds the colony and pollination helps flowers. The queen lays eggs. Drones mate with the queen. Beekeepers harvest honey and wax. ".repeat(3);
  await page.route("https://en.wikipedia.org/w/api.php?action=query&prop=extracts**", r => r.fulfill({ json: { query: { pages: { 1: { title: "Honey bee", extract: text, links: [] } } } } }));
  await page.route("https://en.wikipedia.org/api/rest_v1/page/media-list/**", r => r.fulfill({ json: { items: [
    { title: "File:Queen_bee.jpg", type: "image", showInGallery: true, caption: { text: "A queen honey bee with workers" }, srcset: [{ src: "//upload.wikimedia.org/queen.jpg" }] },
    { title: "File:Wiki_logo.svg", type: "image", showInGallery: true, srcset: [{ src: "//upload.wikimedia.org/logo.svg" }] } ] } }));
  await page.route("https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo**", r => r.fulfill({ json: { query: { pages: { "-1": { title: "File:Queen bee.jpg", imageinfo: [{ thumburl: "https://upload.wikimedia.org/thumb/queen.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Queen_bee.jpg",
    extmetadata: { Artist: { value: "<a href='x'>Jane Doe</a>" }, LicenseShortName: { value: "CC BY-SA 4.0" }, DateTimeOriginal: { value: "2019-05-02" } } }] } } } } }));
  await page.route("https://upload.wikimedia.org/**", r => r.fulfill({ body: PNG, contentType: "image/png" }));
  await openApp(page);
  await loadLink(page, "https://en.wikipedia.org/wiki/Honey_bee");
  await crawlDone(page);
  await page.locator("#bWeb").click();
  await page.locator('#wvTabs [data-tab="media"]').click();
  await expect(page.locator("#pMedia .md-card")).toHaveCount(1); // the logo is left out
  const cite = page.locator("#pMedia .md-cite").first();
  await expect(cite).toContainText("Jane Doe");
  await expect(cite).toContainText("(2019)");
  await expect(cite).toContainText("License: CC BY-SA 4.0");
  await expect(cite).toContainText("commons.wikimedia.org");
  // changing the citation style changes the media citations too
  await page.locator("#wvClose").click();
  await page.locator("#bSettings").click();
  await page.locator('#setTabs [data-g="research"]').click();
  await page.locator("#cfgCiteStyle").selectOption("mla");
  await page.locator("#setBack").click();
  await page.locator("#bWeb").click();
  await page.locator('#wvTabs [data-tab="media"]').click();
  await expect(page.locator("#pMedia .md-cite").first()).toContainText("Jane Doe. “A queen honey bee with workers.”");
});

test("the Media tab explains itself when there are no pictures", async ({ page }) => {
  await openApp(page);
  await page.locator("#bWeb").click();
  await page.locator('#wvTabs [data-tab="media"]').click();
  await expect(page.locator("#pMedia")).toContainText("No pictures or videos yet");
});
