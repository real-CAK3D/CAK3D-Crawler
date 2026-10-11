# CAK3D Crawler

A web crawler that actually crawls a web. A spider walks across any text you give it, grabs the main keywords with its legs, spins silk between them, sorts them into topics, and turns the result into research notes with sources.

**Use it:** [real-cak3d.github.io/CAK3D-Crawler](https://real-cak3d.github.io/CAK3D-Crawler/) (also deployed on Vercel) · **Android:** coming to Google Play; test builds are on [Releases](https://github.com/real-CAK3D/CAK3D-Crawler/releases/latest)

## What it does

- **Crawls anything you read.** Paste text, open a **PDF** (page numbers kept for citations), a **scanned PDF or a photo of a page** (read on your device with OCR), an **EPUB**, `.txt` or `.md` file, give it a web page link, or **search the web** and pick results. Crawl **several sources at once** and see where they agree.
- **Crawls whole sites.** Let the spider follow links up to three levels deep, with a page limit, and see the result as a **site map**.
- **Finds the main keywords** in English, Spanish, French, German, Italian, Portuguese or Dutch, and groups them into topics.
- **Research focus.** Type a topic and the spider only hunts keywords near it. It also **learns your interests**.
- **Egg sacs.** When a web fills up, the spider wraps it into a sac. Open a sac for its keyword tree, key passages and a summary. Spiderlings that hatch mark related keywords and **build silk bridges to related sacs**, showing how two topics connect, with the passages where they meet.
- **Citations everywhere.** Numbered sources with chapter and page, "Show in text", **APA, MLA or Chicago**, a bibliography, and export to **Zotero (RIS)** and **BibTeX**.
- **Study.** Flashcards with **spaced-repetition study sessions**, notes on keywords and passages, search, contents, and read-aloud.
- **Ask the text** a question and get the passages that answer it, plus a cited answer from the AI you choose.
- **Work together.** Share a crawl so others can add notes and sacs (live in the claude.ai version), or swap crawl files.
- **Accessible.** The keyword graph works fully from the keyboard and with screen readers, with a list view; every view is checked with axe on each push.
- **Lots of style:** 8 kinds of spider, 12 looks including realistic and a web-slinger hero, 12 colors, flies for the spider to hunt, seasonal outfits, weather, page themes and presets. Some styles are paid packs (see below).

## Paid packs

Extra spider kinds, looks, colors, seasons and weather, page themes and spiderling styles are sold as packs through Google Play in the Android app. The packs are listed in one place, `PACKS` in `src/cak3d-crawler.html`; their ids must match the in-app products in the Play Console.

While the app is in development every pack stays unlocked. Build with `CRAWLER_LOCK_PAID=1` to switch the locks on, and set `CRAWLER_PLAY_URL` to the Play listing so the website's store links to it.

## AI

Crawling, topics, the graph and citations run entirely on the device. An AI is only used for cited summaries, answers and study guides, and the user chooses it in **Settings → Research → Your AI**:

- **With their own API key:** Claude (Anthropic, through the official Anthropic SDK), OpenAI, Gemini, OpenRouter, Groq, Mistral, DeepSeek, Grok (xAI) or Together AI. Each has a "get a key" link, and **Load models** lists the models that key can use.
- **Free and private, on their own computer:** Ollama on the same device, or **Ollama / LM Studio on their computer**, used from the phone over home Wi-Fi. The website's [`/connect`](web/connect/) page has a one-step setup for Windows, Mac and Linux. It makes Ollama reachable on the home network, allows it through the firewall on private networks, and shows the address to type in. **Find my computer** in the app finds it automatically.
- Or none, which shows the matching passages only.

Keys stay on the device. Consumer subscriptions (ChatGPT Plus, Claude Pro, Gemini Advanced) can't be connected to third-party apps, so the app uses API keys instead. Inside claude.ai the app uses the viewer's Claude account.

The Android app allows plain-HTTP connections (`usesCleartextTraffic`, `allowMixedContent`) so it can reach a computer on the home network. A web page can only reach Ollama on the same computer (`localhost`).

A deployment can provide a default AI through the `CRAWLER_AI_*` variables and the key-holding proxy in [`proxy/`](proxy/), so no key ever reaches the page.

## Development

Requires Node 22.

```bash
npm ci
npm run build      # draws the icons and writes the web app to www/
npm run serve      # http://localhost:8080
npx playwright install chromium
npm test           # opens the app in a browser and checks the features and accessibility
```

### Deploys and releases

- **Tests** (`.github/workflows/test.yml`) run on every push and pull request. Deploys and Android builds only run when they pass.
- **GitHub Pages:** every push to `main` deploys the web app (`.github/workflows/web.yml`).
- **Vercel:** `vercel.json` builds with `npm run build` and serves `www/`. Import the repository in Vercel; no other settings are needed.
- **Android:** pushing a tag like `v1.2.0` builds a signed APK and a Google Play app bundle (`.aab`) with [Capacitor](https://capacitorjs.com) and attaches them to a GitHub release (`.github/workflows/android.yml`).

The Android signing (upload) key lives in the repository secrets `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD`. Keep the same key for every release.

## Project layout

| Path | What it is |
| --- | --- |
| `src/cak3d-crawler.html` | The whole app: one HTML file with its styles and script |
| `scripts/build-web.mjs` | Builds the installable web app: icons, OCR and PDF readers, the Anthropic SDK, config |
| `scripts/make-icons.mjs` | Draws the app icon and splash screen (no image tools needed) |
| `scripts/android-config.mjs` | Sets the Android version and signing during CI |
| `tests/` | Playwright browser tests, including axe accessibility checks |
| `web/` | Web app manifest, offline service worker and privacy policy |
| `proxy/` | Optional Cloudflare Worker that holds an AI key for a deployment |
| `vercel.json` | Vercel build settings |

## License

Proprietary. Copyright (c) 2026 CAK3D, all rights reserved. See [LICENSE](LICENSE). Versions up to v1.1.0 were released under the MIT License.
