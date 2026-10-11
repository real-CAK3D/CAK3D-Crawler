import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const sse = text => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
async function openAiSettings(page) {
  await page.locator("#bSettings").click();
  await page.locator('#setTabs [data-g="research"]').click();
}

test("an API key service: get-a-key link, model list, save and test", async ({ page }) => {
  await page.route("https://api.openai.com/v1/models", route => {
    const ok = route.request().headers().authorization === "Bearer sk-good";
    route.fulfill({ status: ok ? 200 : 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(ok ? { data: [{ id: "gpt-test-mini" }, { id: "text-embedding-3-small" }, { id: "gpt-test" }] } : { error: "bad key" }) });
  });
  await page.route("https://api.openai.com/v1/chat/completions", route => route.fulfill({ headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: sse("Connected.") }));
  await openApp(page);
  await openAiSettings(page);
  await page.locator("#aiService").selectOption("openai");
  await expect(page.locator("#aiKeyHelp a")).toHaveAttribute("href", "https://platform.openai.com/api-keys");
  await expect(page.locator("#aiPcBox")).toBeHidden();
  await page.locator("#aiKey").fill("sk-wrong");
  await page.locator("#aiLoad").click();
  await expect(page.locator("#aiNote")).toContainText("rejected the key");
  await page.locator("#aiKey").fill("sk-good");
  await page.locator("#aiLoad").click();
  await expect(page.locator("#aiNote")).toContainText("Found 2 models"); // the embedding model is left out
  await page.locator("#aiSave").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cak3d-ai")));
  expect(saved).toMatchObject({ service: "openai", provider: "openai", base: "https://api.openai.com/v1", key: "sk-good", model: "gpt-test" });
  await page.locator("#aiTest").click();
  await expect(page.locator("#aiNote")).toContainText("It works");
});

test("Ollama on my computer: type the address, load models, save", async ({ page }) => {
  await page.route("http://192.168.1.50:11434/**", route => {
    const u = route.request().url(), cors = { "access-control-allow-origin": "*" };
    if (u.endsWith("/api/tags")) return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ models: [{ name: "qwen3:4b", capabilities: ["completion"] }, { name: "all-minilm", capabilities: ["embedding"] }] }) });
    route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ data: [{ id: "qwen3:4b" }] }) });
  });
  await openApp(page);
  await openAiSettings(page);
  await page.locator("#aiService").selectOption("ollama-pc");
  await expect(page.locator("#aiKeyBox")).toBeHidden();
  await expect(page.locator("#aiPcHelp")).toContainText("connect");
  await page.locator("#aiHost").fill("192.168.1.50");
  await page.locator("#aiScan").click(); // a full address is tried on its own first
  await expect(page.locator("#aiNote")).toContainText("Found 1 model");
  await page.locator("#aiSave").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cak3d-ai")));
  expect(saved).toMatchObject({ service: "ollama-pc", base: "http://192.168.1.50:11434/v1", model: "qwen3:4b", key: "" });
  // reopening settings shows the same choice and address
  await page.keyboard.press("Escape");
  await openAiSettings(page);
  await expect(page.locator("#aiService")).toHaveValue("ollama-pc");
  await expect(page.locator("#aiHost")).toHaveValue("192.168.1.50");
});

test("older saved settings still open as the right service", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cak3d-ai", JSON.stringify({ provider: "openai", base: "https://openrouter.ai/api/v1", model: "x/y", key: "k" })));
  await openApp(page);
  await openAiSettings(page);
  await expect(page.locator("#aiService")).toHaveValue("openrouter");
  await expect(page.locator("#aiKey")).toHaveValue("k");
});
