import { test, expect } from "@playwright/test";
import { openApp, makePdf } from "./helpers.mjs";

const PAGE1 = "Honey bees live in large colonies with a single queen. Worker bees collect nectar and pollen from flowers and turn the nectar into honey.";
const PAGE2 = "The queen lays eggs in wax cells. Drones mate with queens from other colonies. Beekeepers harvest honey and wax from the hives.";

test("a PDF opens with page numbers and gets crawled", async ({ page }) => {
  await openApp(page);
  await page.locator("#bSource").click();
  await page.locator("#srcFile").setInputFiles({ name: "honey-bees.pdf", mimeType: "application/pdf", buffer: makePdf([PAGE1, PAGE2]) });
  await expect(page.locator("#srcInfo")).toContainText("2 pages");
  await expect(page.locator("#srcText")).toHaveValue(/single queen[\s\S]*Beekeepers harvest/);
  await page.locator("#srcGo").click();
  await expect(page.locator("#dSource")).toBeHidden();
  await expect(page.locator("#page")).toContainText("Beekeepers harvest honey");
  await expect.poll(async () => +(await page.locator("#sTotal").textContent())).toBeGreaterThan(3);
});

test("a photo of a page is read with on-device OCR", async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  // draw a "photo" of a printed page
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1400; c.height = 420;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#111"; g.font = "44px Georgia, serif";
    ["Spiders spin silk from glands", "called spinnerets. Orb weavers", "build round webs to catch insects."].forEach((l, i) => g.fillText(l, 60, 110 + i * 100));
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#bSource").click();
  await page.locator("#srcFile").setInputFiles({ name: "page-photo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.locator("#srcInfo")).toContainText("Read the text from page-photo.png", { timeout: 150_000 });
  await expect(page.locator("#srcText")).toHaveValue(/spinnerets/i);
  await expect(page.locator("#srcText")).toHaveValue(/orb weavers/i);
});
