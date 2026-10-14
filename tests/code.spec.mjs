import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { openApp, tool } from "./helpers.mjs";

async function openCodeReader(page) {
  await tool(page, "bCode");
  await expect(page.locator("#codePage")).toBeVisible();
}
const errorsOf = page => { const errs = []; page.on("pageerror", e => errs.push(e.message)); return errs; };

test("the code reader opens with example code, and explains it", async ({ page }) => {
  const errs = errorsOf(page);
  await openApp(page);
  await openCodeReader(page);
  await expect(page.locator("#cdSide")).toContainText("Example code");
  await expect(page.locator("#cdSide")).toContainText("2 files");
  await expect(page.locator("#cdTrail button")).toHaveCount(1);
  // the Explained tab describes every part in plain words
  await page.locator('#cdTabs [data-cdt="docs"]').click();
  await expect(page.locator("#cdDocs")).toContainText("addItem");
  await expect(page.locator("#cdDocs")).toContainText("is a function");
  await expect(page.locator("#cdDocs")).toContainText("Report");
  await page.locator("#cdSearch").fill("tax");
  await expect(page.locator("#cdDocs .cd-doc")).toHaveCount(2); // TAX_RATE, and totalPrice which reads it
  await expect(page.locator("#cdDocs")).toContainText("TAX_RATE");
  await page.locator("#cdSearch").fill("");
  // tapping a part opens it: what it is, what it calls, where it's used
  await page.locator('#cdDocs .cd-link', { hasText: "addItem" }).first().click();
  await expect(page.locator("#cdSide .term")).toHaveText("addItem");
  await expect(page.locator("#cdSide")).toContainText("Adds an item to the cart");
  await expect(page.locator("#cdSide")).toContainText("It changes");
  await expect(page.locator("#cdSide")).toContainText("cartCount");
  // a use jumps to that line in the code
  await page.locator("#cdSide [data-cd-line]").first().click();
  await expect(page.locator('#cdTabs [data-cdt="code"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#cdSrc .cd-n.hit").first()).toBeVisible();
  // tapping a name in the code explains it
  await page.locator('#cdSrc .cd-n', { hasText: "render" }).first().click();
  await expect(page.locator("#cdSide .term")).toHaveText("render");
  await expect(page.locator("#cdSide")).toContainText("Called by");
  // Escape and Back leave the code reader
  await page.keyboard.press("Escape");
  await expect(page.locator("#codePage")).toBeHidden();
  expect(errs).toEqual([]);
});

test("the map is a web you can drill into", async ({ page }) => {
  const errs = errorsOf(page);
  await openApp(page);
  await openCodeReader(page);
  const box = await page.locator("#cdCanvas").boundingBox();
  await expect(async () => {
    await page.mouse.click(box.x + box.width / 2 + Math.min(box.width, box.height) * 0.17, box.y + box.height / 2 + 6);
    await expect(page.locator("#cdTrail button")).toHaveCount(2, { timeout: 1500 });
  }).toPass();
  await expect(page.locator("#cdSide .term")).not.toBeEmpty();
  await page.locator('#cdTrail [data-cd-to="0"]').click();
  await expect(page.locator("#cdTrail button")).toHaveCount(1);
  expect(errs).toEqual([]);
});

test("paste code in any language", async ({ page }) => {
  const errs = errorsOf(page);
  await openApp(page);
  await openCodeReader(page);
  await page.locator("#cdOpen").click();
  await page.locator("#cdPasteBtn").click();
  await page.locator("#cdPasteText").fill(`package main
import "fmt"
type Point struct { X int }
func (p *Point) Move(dx int) { p.X += dx; show(p) }
func show(p *Point) { fmt.Println(p.X) }
func main() { pt := &Point{}; pt.Move(2) }`);
  await page.locator("#cdPasteGo").click();
  await expect(page.locator("#dCodePaste")).toBeHidden();
  await expect(page.locator("#cdSide")).toContainText("Go");
  await page.locator('#cdTabs [data-cdt="docs"]').click();
  await expect(page.locator("#cdDocs")).toContainText("Move");
  await expect(page.locator("#cdDocs")).toContainText("show");
  expect(errs).toEqual([]);
});

test("open several files, or a .zip of a project (skipping node_modules)", async ({ page }) => {
  const errs = errorsOf(page);
  await openApp(page);
  await openCodeReader(page);
  await page.locator("#cdFiles").setInputFiles([
    { name: "util.py", mimeType: "text/x-python", buffer: Buffer.from("def double(n):\n    return n * 2\n") },
    { name: "app.py", mimeType: "text/x-python", buffer: Buffer.from("from util import double\n\ndef main():\n    print(double(21))\n") },
    { name: "photo.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71]) }
  ]);
  await expect(page.locator("#cdSide")).toContainText("2 files");
  await page.locator('#cdTabs [data-cdt="code"]').click();
  await expect(page.locator("#cdFileTabs .chip")).toHaveCount(2);
  // a project .zip
  const zip = new JSZip();
  zip.file("shop/src/cart.js", "export function add(a, b) { return a + b; }\nexport const total = add(1, 2);\n");
  zip.file("shop/src/ui.js", "import { add } from './cart.js';\nfunction draw() { return add(2, 3); }\n");
  zip.file("shop/node_modules/lib/index.js", "function ignoreMe() {}");
  zip.file("shop/README.md", "# not code");
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  await page.locator("#cdFiles").setInputFiles({ name: "shop.zip", mimeType: "application/zip", buffer: buf });
  await expect(page.locator("#cdSide")).toContainText("shop");
  await expect(page.locator("#cdSide")).toContainText("2 files");
  await page.locator('#cdTabs [data-cdt="docs"]').click();
  await expect(page.locator("#cdDocs")).not.toContainText("ignoreMe");
  await expect(page.locator("#cdDocs")).toContainText("draw");
  expect(errs).toEqual([]);
});

test("open a GitHub project", async ({ page }) => {
  const errs = errorsOf(page);
  await page.route("https://api.github.com/repos/someone/tiny", r => r.fulfill({ json: { default_branch: "main" }, headers: { "access-control-allow-origin": "*" } }));
  await page.route("https://api.github.com/repos/someone/tiny/git/trees/main?recursive=1", r => r.fulfill({ headers: { "access-control-allow-origin": "*" }, json: { tree: [
    { path: "lib/math.ts", type: "blob", size: 60 }, { path: "index.ts", type: "blob", size: 60 }, { path: "logo.png", type: "blob", size: 900 }, { path: "node_modules/x/a.js", type: "blob", size: 10 } ] } }));
  await page.route("https://raw.githubusercontent.com/someone/tiny/main/**", r => {
    const p = new URL(r.request().url()).pathname;
    r.fulfill({ headers: { "access-control-allow-origin": "*" }, body: p.endsWith("math.ts") ? "export function square(x: number): number { return x * x; }\n" : "import { square } from './lib/math';\nconsole.log(square(4));\n" });
  });
  await openApp(page);
  await openCodeReader(page);
  await page.locator("#cdOpen").click();
  await page.locator("#cdGitBtn").click();
  await page.locator("#cdGitUrl").fill("https://github.com/someone/tiny");
  await page.locator("#cdGitGo").click();
  await expect(page.locator("#dCodeGit")).toBeHidden();
  await expect(page.locator("#cdSide")).toContainText("someone/tiny");
  await expect(page.locator("#cdSide")).toContainText("2 files");
  await page.locator('#cdTabs [data-cdt="docs"]').click();
  await expect(page.locator("#cdDocs")).toContainText("square");
  expect(errs).toEqual([]);
});

test("the code reader fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await openCodeReader(page);
  for (const t of ["map", "code", "docs"]) {
    await page.locator(`#cdTabs [data-cdt="${t}"]`).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  const open = await page.locator("#cdOpen").boundingBox();
  expect(open.x + open.width).toBeLessThanOrEqual(390);
});
