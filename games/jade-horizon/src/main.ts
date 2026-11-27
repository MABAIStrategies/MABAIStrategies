import './style.css';
import { App } from './app';
import { waitForFonts } from './faces';
import { campaignLevel, quickLevel } from './levels';

// Snapshot the page source before the UI mutates the DOM (used by "Export Code").
const SOURCE = '<!doctype html>\n' + document.documentElement.outerHTML;

async function boot() {
  const loader = document.getElementById('loader');
  try {
    await waitForFonts();
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    const app = new App(canvas, SOURCE);
    // Exposed for console tinkering and automated smoke tests.
    Object.assign(window, { jade: app, jadeLevels: { campaignLevel, quickLevel } });
    app.title();
  } catch (e) {
    console.error(e);
    if (loader) loader.innerHTML = `<p>Jade Horizon needs WebGL. Try a recent Chrome, Edge, Firefox or Safari.</p><pre>${String(e).replace(/</g, '&lt;')}</pre>`;
    return;
  }
  loader?.classList.add('done');
  setTimeout(() => loader?.remove(), 900);
}

boot();
