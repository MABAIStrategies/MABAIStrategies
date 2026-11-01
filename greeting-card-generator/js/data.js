// data.js — Catalog of occasions, visual themes and color schemas.
// Everything the generator needs to compose a card lives here so the
// browse screens and the generator stay in sync from a single source.

export const OCCASIONS = [
  { id: 'birthday',      name: 'Birthday',        emoji: '🎂', headline: 'Happy Birthday',     sub: 'Wishing you a wonderful year ahead' },
  { id: 'anniversary',   name: 'Anniversary',     emoji: '💞', headline: 'Happy Anniversary',  sub: 'To many more years together' },
  { id: 'wedding',       name: 'Wedding',         emoji: '💍', headline: 'Congratulations',    sub: 'On your wedding day' },
  { id: 'thankyou',      name: 'Thank You',       emoji: '🙏', headline: 'Thank You',          sub: 'For everything you do' },
  { id: 'congrats',      name: 'Congrats',        emoji: '🎉', headline: 'Congratulations',    sub: 'You absolutely earned it' },
  { id: 'getwell',       name: 'Get Well',        emoji: '🌷', headline: 'Get Well Soon',      sub: 'Sending you strength and love' },
  { id: 'holiday',       name: 'Holidays',        emoji: '🎄', headline: 'Happy Holidays',     sub: 'Warmth and joy this season' },
  { id: 'newyear',       name: 'New Year',        emoji: '🎆', headline: 'Happy New Year',     sub: "Here's to a brilliant year" },
  { id: 'valentine',     name: "Valentine's",     emoji: '❤️', headline: 'Be My Valentine',    sub: 'You have all my heart' },
  { id: 'mothers',       name: "Mother's Day",    emoji: '🌸', headline: "Happy Mother's Day",  sub: 'Thank you for everything' },
  { id: 'fathers',       name: "Father's Day",    emoji: '🧭', headline: "Happy Father's Day",  sub: 'The greatest of them all' },
  { id: 'graduation',    name: 'Graduation',      emoji: '🎓', headline: 'Congrats Grad',      sub: 'The future is yours' },
  { id: 'baby',          name: 'New Baby',        emoji: '🍼', headline: 'Welcome Little One',  sub: 'A new adventure begins' },
  { id: 'sympathy',      name: 'Sympathy',        emoji: '🕊️', headline: 'With Sympathy',      sub: 'Thinking of you' },
  { id: 'justbecause',   name: 'Just Because',    emoji: '✨', headline: 'Just Because',        sub: 'Thinking of you today' },
];

// Themes drive the visual language: background style, motif family and
// typography personality. `keywords` let a free-text vibe auto-select a theme.
export const THEMES = [
  { id: 'cyberpunk',  name: 'Cyberpunk',   motif: 'grid',      font: 'mono',    bg: 'neon',      keywords: ['cyberpunk','neon','cyber','tech','futuristic','glitch','synthwave','matrix'] },
  { id: 'lofi',       name: 'Lo-Fi',       motif: 'bokeh',     font: 'round',   bg: 'dusk',      keywords: ['lofi','lo-fi','chill','rainy','rain','cozy','calm','study','mellow'] },
  { id: 'minimal',    name: 'Minimalist',  motif: 'line',      font: 'sans',    bg: 'flat',      keywords: ['minimal','clean','simple','modern','flat','elegant'] },
  { id: 'watercolor', name: 'Watercolor',  motif: 'blob',      font: 'serif',   bg: 'wash',      keywords: ['watercolor','soft','painterly','gentle','pastel','dreamy'] },
  { id: 'vintage',    name: 'Retro',       motif: 'sunburst',  font: 'display', bg: 'grain',     keywords: ['retro','vintage','70s','80s','old','nostalgic','classic'] },
  { id: 'botanical',  name: 'Botanical',   motif: 'leaf',      font: 'serif',   bg: 'wash',      keywords: ['botanical','floral','flower','garden','nature','leaf','plant','spring'] },
  { id: 'geometric',  name: 'Geometric',   motif: 'poly',      font: 'sans',    bg: 'flat',      keywords: ['geometric','abstract','shapes','bauhaus','bold','angular'] },
  { id: 'cosmic',     name: 'Cosmic',      motif: 'stars',     font: 'display', bg: 'space',     keywords: ['cosmic','space','galaxy','stars','celestial','night','universe','stellar'] },
  { id: 'vaporwave',  name: 'Vaporwave',   motif: 'grid',      font: 'display', bg: 'neon',      keywords: ['vaporwave','aesthetic','80s','miami','sunset','pastelneon'] },
  { id: 'artdeco',    name: 'Art Deco',    motif: 'fan',       font: 'display', bg: 'gold',      keywords: ['deco','artdeco','gatsby','luxury','gold','glamour','elegant'] },
];

// Color schemas. Each palette is ordered [deep, mid, light, accent, glow].
export const PALETTES = [
  { id: 'neon-noir',    name: 'Neon Noir',     colors: ['#0a0a1a', '#1b1b3a', '#3d2b7a', '#ff2e97', '#00e5ff'] },
  { id: 'rainy-dusk',   name: 'Rainy Dusk',    colors: ['#1a2030', '#2b3550', '#4a5a80', '#8fa8d8', '#c9d6f0'] },
  { id: 'sunset-pop',   name: 'Sunset Pop',    colors: ['#2b1055', '#7b2ff7', '#f72585', '#ff8c42', '#ffd166'] },
  { id: 'sage-cream',   name: 'Sage & Cream',  colors: ['#3a4a3f', '#6b8f71', '#a8c3a0', '#e8e4d0', '#f4a259'] },
  { id: 'blush-rose',   name: 'Blush Rose',    colors: ['#5c2a3e', '#a13d63', '#e08fa8', '#f7d0dd', '#ffe8b0'] },
  { id: 'midnight-gold',name: 'Midnight Gold', colors: ['#0d1b2a', '#1b263b', '#415a77', '#d4af37', '#f0e6c0'] },
  { id: 'mint-berry',   name: 'Mint Berry',    colors: ['#12343b', '#2d6a6a', '#5fbf9f', '#e84a5f', '#ffd6a5'] },
  { id: 'cotton-candy', name: 'Cotton Candy',  colors: ['#3a2e5c', '#7161a8', '#b39ddb', '#ffb3d9', '#a0f0ff'] },
  { id: 'ember',        name: 'Ember',         colors: ['#1a0e0a', '#4a1f12', '#a83c22', '#f26a1b', '#ffce54'] },
  { id: 'ocean-glass',  name: 'Ocean Glass',   colors: ['#04202c', '#0b4f6c', '#2596be', '#7fe0d3', '#eafff6'] },
  { id: 'forest-fog',   name: 'Forest Fog',    colors: ['#14231b', '#27412f', '#4f7a54', '#9dc08b', '#ede6c8'] },
  { id: 'grape-soda',   name: 'Grape Soda',    colors: ['#160a2b', '#3d1e6d', '#7b2cbf', '#c77dff', '#80ffea'] },
];

// Vibe keywords that toggle atmospheric effects on top of any theme.
export const EFFECT_KEYWORDS = {
  rain:      ['rain','rainy','storm','drizzle','wet'],
  scanlines: ['glitch','crt','scanline','vhs','tv','static'],
  grain:     ['grain','film','analog','lofi','lo-fi','vintage','retro'],
  bokeh:     ['bokeh','dreamy','soft','blur','glow','cozy'],
  stars:     ['star','night','cosmic','space','galaxy','sparkle','celestial'],
  confetti:  ['party','celebrate','confetti','festive','fun'],
  snow:      ['snow','winter','frost','holiday','christmas','icy'],
};

export const OCCASION_MAP = Object.fromEntries(OCCASIONS.map(o => [o.id, o]));
export const THEME_MAP = Object.fromEntries(THEMES.map(t => [t.id, t]));
export const PALETTE_MAP = Object.fromEntries(PALETTES.map(p => [p.id, p]));
