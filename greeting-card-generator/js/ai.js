// ai.js — Optional real AI image generation.
// Off by default. When the user supplies their own OpenAI-compatible image
// endpoint + key in Settings, we compose a rich prompt from the card DNA and
// request a 9:16-ish image. Remix passes the reference vibe forward in the
// prompt. The procedural engine remains the always-available fallback, so any
// failure here degrades gracefully rather than breaking generation.

import { OCCASION_MAP, THEME_MAP, PALETTE_MAP } from './data.js';

export function buildPrompt(cfg, reference) {
  const occ = OCCASION_MAP[cfg.occasion];
  const theme = THEME_MAP[cfg.theme];
  const pal = PALETTE_MAP[cfg.paletteId];
  const fx = Object.entries(cfg.effects || {}).filter(([, v]) => v).map(([k]) => k);
  const parts = [
    `A vertical 9:16 greeting card for "${occ?.name || 'a special occasion'}".`,
    cfg.vibe ? `Vibe: ${cfg.vibe}.` : '',
    theme ? `Visual style: ${theme.name}.` : '',
    pal ? `Color palette: ${pal.colors.join(', ')}.` : '',
    fx.length ? `Atmosphere: ${fx.join(', ')}.` : '',
    `Elegant composition with generous negative space for the greeting text "${cfg.headline}".`,
    reference ? 'Keep the mood and palette consistent with the previous design, as a fresh variation.' : '',
    'High quality, print-ready, no watermark.',
  ];
  return parts.filter(Boolean).join(' ');
}

// Returns a data URL (or remote URL) for the generated image, or throws.
export async function generateAIImage(cfg, settings, reference) {
  const prompt = buildPrompt(cfg, reference);
  const body = {
    model: settings.model,
    prompt,
    n: 1,
    size: '1024x1536', // closest common portrait size to 9:16
  };
  const res = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error('AI response did not include an image.');
}
