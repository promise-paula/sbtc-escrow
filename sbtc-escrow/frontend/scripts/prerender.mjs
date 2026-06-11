// Prerender the public routes to static HTML.
//
// Why a real browser (not react-dom/server / jsdom): the app runs browser-only
// code at module load (wallet SDK, window redirects, localStorage), which would
// crash a server-string render. So we serve the built SPA, drive it with
// headless Chrome, and snapshot the fully-rendered HTML (content + the per-route
// <head> tags react-helmet-async injects). Non-JS crawlers and social scrapers
// then get real content and correct previews per route; the client still boots
// the SPA on top as usual.
//
// Browser: local Chrome in dev; @sparticuz/chromium in CI/Vercel builds (their
// containers have no Chrome). Routes come from the generated sitemap.
//
// BEST-EFFORT: any failure here is caught and the process exits 0, so a
// prerender problem can NEVER break the deploy — worst case you ship the plain
// SPA (today's behavior). Check the build log for "[prerender] done — N routes"
// to confirm it ran.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..'); // frontend/
const DIST = join(ROOT, 'dist');
const PORT = 4178;
const ORIGIN = `http://localhost:${PORT}`;

function findLocalChrome() {
  return [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean).find((p) => { try { return existsSync(p); } catch { return false; } });
}

async function browserLaunchOptions() {
  const local = findLocalChrome();
  if (local) {
    return { executablePath: local, headless: 'new', args: ['--no-sandbox'] };
  }
  // No local Chrome (CI / Vercel build) — use the bundled serverless Chromium.
  const chromium = (await import('@sparticuz/chromium')).default;
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: chromium.headless,
    defaultViewport: { width: 1280, height: 900 },
  };
}

function routesFromSitemap() {
  const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start in time');
}

async function main() {
  if (!existsSync(DIST)) throw new Error('dist/ not found — run `vite build` first.');

  const vite = join(ROOT, 'node_modules', '.bin', 'vite');
  const server = spawn(vite, ['preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    await waitForServer(`${ORIGIN}/`);
    const routes = routesFromSitemap();
    const browser = await puppeteer.launch(await browserLaunchOptions());

    for (const route of routes) {
      const page = await browser.newPage();
      await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await page.waitForSelector('#root > *', { timeout: 10000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200)); // let helmet + lazy content settle
      const html = await page.evaluate(() => `<!doctype html>\n${document.documentElement.outerHTML}`);
      await page.close();

      const outPath = route === '/' ? join(DIST, 'index.html') : join(DIST, route, 'index.html');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, html);
      console.log(`[prerender] ${route} -> ${outPath.replace(DIST, 'dist')}`);
    }

    await browser.close();
    console.log(`[prerender] done — ${routes.length} routes`);
  } finally {
    stop();
  }
}

main().catch((err) => {
  // Best-effort: never fail the build. Worst case ships the SPA unchanged.
  console.warn(`[prerender] skipped (${err?.message || err}). Shipping SPA without prerendered routes.`);
  process.exit(0);
});
