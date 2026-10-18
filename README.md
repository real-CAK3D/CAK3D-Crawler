# Arachnotes

Arachnotes is a reading and study app for Android and the web. You give it a text: a web page, a PDF, an EPUB, a photo of a page, or something you paste in. An animated spider crawls the text keyword by keyword, sorts the keywords into topics, and builds study material from what it finds: a study guide, flashcards, a keyword map, and notes with citations.

Made by CAK3D_Creations. **Android:** coming to Google Play (package `com.arachnotes.web`). **Website:** [arachnotes-web.vercel.app](https://arachnotes-web.vercel.app/), with the download, the public Issues and Ideas forum, the privacy policy and the terms. **Web app:** [arachnotes.vercel.app](https://arachnotes.vercel.app/), which allows 2 uploads per browser.

## What it does

- **Starts with a guide.** The first time, the app opens on a guide to itself. It has moving examples, and its buttons open a real Wikipedia article, a real web page and real code. The spider crawls the guide as you read it. **Settings → Research → When the app opens** chooses between where you left off, the guide, or a blank page.
- **Opens almost any text.** Paste text, or open a link. You can also open a file:
  - a PDF (page numbers are kept for citations) or an EPUB
  - Word, PowerPoint, Excel or OpenDocument files
  - RTF, a saved web page, Markdown or plain text
  - subtitles (`.srt`, `.vtt`), a Jupyter notebook, CSV or JSON
  - code files
  - a scanned PDF or a photo of a page, read on the device with OCR It can also search the web for more pages on the same subject and crawl several sources together.
- **Finds keywords and topics.** The spider reads each keyword in context and decides which topic it belongs to. The live stats panel shows each decision, how sure it is, and which ones it leaves for you to decide. Type a focus topic and it goes for matching keywords first.
- **Makes study material.** A study guide (key points, terms, questions, sources), flashcards with spaced repetition, a keyword map, a timeline, an outline you can save as Markdown, and notes on any keyword or passage.
- **Cites its sources.** Numbered sources with page numbers, APA, MLA or Chicago style, a bibliography, and export to Zotero (RIS) and BibTeX.
- **Answers questions.** Ask the text a question and get the passages that answer it. With an AI set up, it also writes a short cited answer.
- **Keywords with context and outside facts.** Tap a keyword to see its topic, the sentences it's in and the paragraph around each one. When online, it also shows a short summary from Wikipedia, or a Wiktionary definition, with the article's picture (credited, in the Media tab). Summaries also appear on flashcards and in the study guide's key terms, and each topic gets three related articles to crawl next. Settings → Research → *Look up keywords online*: when you open a keyword, as the spider catches each one, or off.
- **A free AI with no key.** Settings → Research → Your AI → *On this device*. It downloads a small open model once (SmolLM2, about 370 MB, or Qwen 2.5, about 520 MB) and runs it on the device with transformers.js, using WebGPU where there is one and WebAssembly otherwise. After that it works offline, and nothing is sent anywhere. If the browser has its own built-in AI (Chrome's Gemini Nano), that's used instead.
- **Share to Arachnotes.** On Android, Arachnotes is in the Share and *Open with* menus for links, text, PDFs, books, Office files, photos and code. The installed web app accepts shared links and text too.
- **Keeps crawling in the background.** Leave the app mid-crawl and the spider carries on without drawing anything. With Settings → Research → *Notify me when a crawl finishes* on, a notification says when it's done (made on the device with Capacitor's LocalNotifications on Android, or the service worker on the web).
- **A first-run walkthrough** highlights each part of the screen, with Next, Back and Skip. Help → *Take the tour* shows it again.
- **Moves between devices.** There are no accounts. Crawls move between devices with a weave code or a crawl file, and the whole library can be backed up to a file.
- **Keeps the pictures and videos.** When it crawls a web page it keeps the pictures and videos with their captions, credits and licenses, sorts each into the topic and keywords it shows, and cites it in the chosen style. They appear in the web view's Media tab, in keyword notes, egg sacs, the study guide and saved notes.
- **Reads code too.** Pages → Read code opens a separate code reader: paste code, open files, a .zip of a project, or a GitHub link. It maps every function, class and variable as a spider web, shows where each is defined, read, changed and called, and explains the whole codebase in plain words. It works on the device for JavaScript/TypeScript, Python, Java, C/C++, C#, Go, Rust, Kotlin, Swift, PHP, Ruby and shell scripts.
- **Explains itself.** The **?** button lists what everything on screen is, shows a legend of the topic colors and marks, and has *Point at anything*: tap any part of the screen to see what it is.

## The spider and the store

The spider is drawn and animated in code. It walks on its eight legs, spins threads between keywords, wraps finished topics into egg sacs, hatches spiderlings, hunts flies (chasing, pouncing, lassoing them with silk or waiting in ambush), spins a web in a corner of the screen when it has nothing to do, and now and then walks along the screen's edges, drawn from the side. Optional sounds and music are made by the app itself, with no sound files.

The basics are free: the cobweb weaver, the classic silhouette, slow and normal speed, a few kinds of weather, the Auto, Paper, Night and High contrast themes, and the Classic and Study presets. Every reading and study feature is free.

Extra spider kinds, looks (including a lobster), colors, hats and seasonal looks, weather, bored behaviors, hunting styles, web styles, bugs to catch, page themes and presets are sold in the Android app through Google Play, singly or in bundles. A bundle includes anything added to its sections later. The full list, with prices, is the `storeCatalog` block in `src/arachnotes.html`. `npm run play-products` turns it into `play-products.csv` for creating the in-app products in the Play Console; the product ids must match.

While the app is in development everything is unlocked. Build with `CRAWLER_LOCK_PAID=1` to switch the locks on.

## AI (optional)

Keyword finding, topics, the map and citations all run on the device. An AI is only used for written summaries, answers and study guides. Users choose one in **Settings → Research → Your AI**:

- **Their own API key** for Claude (Anthropic), OpenAI, Gemini, OpenRouter, Groq, Mistral, DeepSeek, Grok (xAI) or Together AI. The key stays on the device and is only sent to that service.
- **A model on their own computer:** Ollama or LM Studio, used from the phone over home Wi-Fi. The website's [`/connect`](web/connect/) page sets this up on Windows, Mac or Linux, and **Find my computer** in the app finds it.
- **None:** the app shows the matching passages without a written answer.

Consumer subscriptions such as ChatGPT Plus or Claude Pro can't be connected to other apps, which is why the app uses API keys.

## Support and fixes

Each install makes a random support ID (like `AN-7K3Q-9XWD-2M4P`), shown in **Settings → Help & support**. **Report an issue** sends the user's message, that ID, the app version and, if they agree, their app settings to a Supabase database. Reports can't be read from the app.

To fix a problem for one user without an app update, add a row to the `fixes` table with their support ID. The app checks for it when it starts. A row with the ID `*` applies to everyone. The `actions` column can contain:

| Key | Effect |
| --- | --- |
| `message` | Shows a short message once |
| `resetSettings` | Resets all settings to the defaults |
| `cfg` | Sets specific settings, e.g. `{"speed": 1}` |
| `grant` / `revoke` | Gives or removes store items by product id |

Reports older than 12 months are deleted automatically.

## Development

Requires Node 22.

```bash
npm ci
npm run build      # draws the icons and writes the app to www/
npm run serve      # http://localhost:8080
npx playwright install chromium
npm test           # checks the features and accessibility in a real browser
```

`npm run build` minifies and obfuscates the app's code. Use `PLAIN_BUILD=1 npm run build` for a readable build while debugging.

### Releases

- **Tests** (`.github/workflows/test.yml`) run on every push. Deploys and Android builds only run when they pass.
- **Web app:** every push to `main` deploys the app to Vercel at arachnotes.vercel.app (`vercel.json`) and to GitHub Pages (`web.yml`). Both builds set `CRAWLER_WEB_UPLOADS=2`, which allows 2 uploads per browser. The limit counts texts, files, links, search results (each source in a combined crawl counts), texts added in Compare, crawl files, weave codes, restored backups and code projects. The guide's examples, the built-in code example and the library don't count. The count is stored in local storage, IndexedDB and a cookie, and the highest of the three is used. Android has no limit.
- **Website:** `site/` is a plain static site, deployed by Vercel to arachnotes-web.vercel.app. Its Issues and Ideas forum keeps posts in the Supabase project and reads and writes them only through the `forum_*` functions. Posts that are alike are tied together with `forum_web` and `forum_related`. To moderate, change a post's `status` (to `hidden`, `planned`, `fixed` and so on) in the `forum_posts` table. Write your reply in `dev_note`, or add a row to `forum_replies` with `is_dev` set to true.
- **Android:** pushing a tag like `v1.9.0` builds a signed APK and a Play app bundle (`.aab`) with [Capacitor](https://capacitorjs.com) and attaches them to a GitHub release (`android.yml`). If the `PLAY_SERVICE_ACCOUNT_JSON` secret is set, the bundle is also uploaded to the Play Console's internal testing track as a draft.
- **Play listing:** the *Play listing* workflow (run it from the Actions tab) sends the name and descriptions in `store-listing/listing.md`, and optionally the icon, feature graphic and screenshots, to the Play Console through `scripts/play-listing.mjs`. It uses the same `PLAY_SERVICE_ACCOUNT_JSON` secret. `node scripts/store-shots.mjs` retakes the screenshots and demo video from the built app.

The Android upload key lives in the repository secrets `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD`. Use the same key for every release.

## Project layout

| Path | What it is |
| --- | --- |
| `src/arachnotes.html` | The whole app: one HTML file with its styles, script and store catalog |
| `scripts/build-web.mjs` | Builds the app into `www/`: config, PDF and OCR readers, the Anthropic SDK, code protection |
| `scripts/make-icons.mjs` | Draws the app icon and splash screen |
| `scripts/android-config.mjs` | Sets the Android version and signing in CI |
| `scripts/play-products.mjs` | Writes the Play Console product list from the store catalog |
| `tests/` | Playwright browser tests, with axe accessibility checks |
| `web/` | Web manifest, offline service worker, privacy policy, and the `/connect` setup page |
| `site/` | The Arachnotes website: home and download, the Issues and Ideas forum, privacy policy and terms |
| `proxy/` | Optional Cloudflare Worker that holds an AI key for a deployment |

## License

Proprietary. © 2026 CAK3D_Creations. All rights reserved. Arachnotes™ and the Arachnotes spider are trademarks of CAK3D_Creations. See [LICENSE](LICENSE). Versions up to v1.1.0 were released under the MIT License.
