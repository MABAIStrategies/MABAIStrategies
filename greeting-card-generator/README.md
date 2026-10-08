# 💌 Vibe Cards — Greeting Card Generator

A mobile-first web app for generating greeting card templates from a **vibe**.
Describe a mood (e.g. *"rainy cyberpunk lo-fi"*) and get **4 variations** in a
crisp **9:16** aspect ratio. Tap any card to open it full screen, then
**Download** it or **Remix** it — remixing uses the current card as the
reference for the next batch.

No build step, no backend, no account. It's a static app that runs anywhere and
works fully offline out of the box.

## Features

- **Vibe → 4 cards.** A free-text vibe drives theme, palette and atmospheric
  effects. Each batch renders four distinct 9:16 variations.
- **Full-screen viewer** with **Download** (PNG) and **Remix**. Remix keeps the
  card's "DNA" (occasion, theme, palette, effects) and generates a fresh,
  related batch seeded from it.
- **Browse** ready-made **Occasions** (birthday, wedding, thank-you, holidays…),
  visual **Themes** (cyberpunk, lo-fi, watercolor, art deco…), and **Color
  schemas** — tap any to generate instantly.
- **Saved favorites gallery.** Tap the heart on any card; favorites persist in
  your browser and reopen in the viewer.
- **Instant offline renderer.** A deterministic Canvas engine composes real
  cards (gradients, motifs, rain/grain/bokeh/starfields, typography) with zero
  network calls — same input always reproduces the same art.
- **Optional AI images.** Add your own OpenAI-compatible image endpoint + key in
  ⚙️ Settings to generate photoreal cards; it falls back to the instant
  renderer if the API is unavailable. Your key stays in your browser.

## Run it

It's plain static files using ES modules, so serve it over HTTP (opening
`index.html` via `file://` won't load modules):

```bash
cd greeting-card-generator
python3 -m http.server 8099
# open http://localhost:8099
```

Or deploy the folder to any static host (GitHub Pages, Netlify, etc.).

## How it works

| File | Role |
|------|------|
| `js/data.js` | Catalog: occasions, themes, color schemas, effect keywords |
| `js/generator.js` | Seeded procedural Canvas renderer + vibe parsing + batch/remix logic |
| `js/ai.js` | Optional OpenAI-compatible image provider (prompt building + fetch) |
| `js/storage.js` | Favorites + settings persistence via `localStorage` |
| `js/app.js` | UI wiring: screens, viewer, remix, favorites, settings |
| `css/styles.css` | Mobile-first dark UI |

**Remix as reference:** each card carries a full config. Remixing passes that
config as the `reference` to the next generation, which inherits its occasion,
theme, palette and effects while mutating the seed — so the new batch is clearly
a variation on the card you started from. When the AI provider is enabled, the
reference is carried into the image prompt instead.

## Privacy

Everything runs client-side. Favorites and settings live only in your browser's
`localStorage`. If you enable the AI provider, requests go directly from your
browser to the endpoint you configure — nothing is proxied through a server.
