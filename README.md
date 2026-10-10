# CAK3D Crawler

A web crawler that actually crawls a web. A spider walks across any text you give it, grabs the main keywords with its legs, spins silk between them, sorts them into topics, and turns the result into research notes with sources.

**Use it:** [real-cak3d.github.io/CAK3D-Crawler](https://real-cak3d.github.io/CAK3D-Crawler/) · **Android:** download the APK from [Releases](https://github.com/real-CAK3D/CAK3D-Crawler/releases/latest)

## What it does

- **Crawls any text.** Paste a chapter or a whole book, open a `.txt` file, or give it a web page link. Wikipedia articles load directly; other sites are read through the free [r.jina.ai](https://jina.ai/reader) reader service.
- **Finds the main keywords** (words and two-word phrases) and groups them into topics by which ones appear in the same sentences.
- **Research focus.** Type a topic and the spider only hunts keywords near it. The best matches show up as prey.
- **Egg sacs.** When a web fills up, the spider wraps it into a sac. Click a sac to see its keyword tree, key passages, and a summary. Merge, split, rename, or hand-pick keywords into your own sacs.
- **Citations everywhere.** Summaries and answers cite numbered sources. Each source shows where it is in the text (section and paragraph), has a "Show in text" button, and links to the original page, jumping straight to the passage when the text came from a link.
- **Ask the text** a question and get the passages that answer it, plus a cited answer from Claude when it's available.
- **Web view** with a zoomable graph, a timeline of where topics appear, a comparison with a second text, and flashcards.
- **Library** to save crawls and come back to them. **Export** notes as Markdown, keywords as CSV, or flashcards as CSV (works with Anki).
- **Lots of style:** 8 spider looks, 4 kinds of movement, 8 entrances and exits, 7 web layouts, 5 thread color modes, catch effects, spiderling options, 9 themes, weather, and presets.

## Claude features outside claude.ai

Inside claude.ai the app uses your Claude account for summaries and answers. In the web and Android versions you can add your own Anthropic API key in **Settings → Research**. The key is stored only on your device, requests go straight from your device to Anthropic, and usage is billed to that key. Without a key you still get the matching passages as sources.

## Build it yourself

Requires Node 22.

```bash
npm ci
npm run icons
npm run build      # writes the web app to www/
npm run serve      # http://localhost:8080
```

### Releases

- Every push to `main` deploys the web app to GitHub Pages (`.github/workflows/web.yml`).
- Pushing a tag like `v1.2.0` builds a signed Android APK with [Capacitor](https://capacitorjs.com) and publishes a GitHub release with the APK and a zip of the web app (`.github/workflows/android.yml`).

```bash
git tag v1.0.1
git push origin v1.0.1
```

The Android signing key lives in the repository secrets `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD`. Keep the same key for every release; Android only installs an update over an existing install when it's signed with the same key. Without those secrets the workflow builds a debug APK instead.

## Project layout

| Path | What it is |
| --- | --- |
| `src/silk-crawler.html` | The whole app: one HTML file with its styles and script |
| `scripts/build-web.mjs` | Wraps the app into an installable web app and bundles the Anthropic SDK |
| `scripts/make-icons.mjs` | Draws the app icon and splash screen (no image tools needed) |
| `scripts/android-config.mjs` | Sets the Android version and signing during CI |
| `web/` | Web app manifest and offline service worker |

## License

MIT
