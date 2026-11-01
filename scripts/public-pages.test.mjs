import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('favicon uses a compact raster of the unchanged brand instead of the full logo download', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="icon" type="image\/png" sizes="64x64" href="\/brand\/favicon-64.png"/);
  const image = readFileSync(new URL('../public/brand/favicon-64.png', import.meta.url));
  assert.ok(image.length < 12_000, 'favicon payload budget');
  assert.equal(image.readUInt32BE(16), 64);
  assert.equal(image.readUInt32BE(20), 64);
  assert.ok(existsSync(new URL('../public/brand/al-midan-logo.png', import.meta.url)), 'original logo preserved');
});

const path = new URL('../src/lib/routeMetadata.ts', import.meta.url);
test('crawler files enumerate only deliberate public routes and private routes have a header-level noindex', () => {
  const robotsPath = new URL('../public/robots.txt', import.meta.url);
  assert.ok(existsSync(robotsPath), 'robots must be a real static file, not the SPA shell');
  const robots = readFileSync(robotsPath, 'utf8');
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/www.qtrgame.net\/sitemap.xml/);
  for (const route of ['admin','play','tv','act']) assert.match(robots, new RegExp(`Disallow: /${route}`));
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(urls, ['/', '/host', '/challenge', '/help', '/privacy'].map(p => `https://www.qtrgame.net${p}`));
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const route of ['/admin', '/host/:code', '/play/:code', '/tv/:code', '/act/:code']) {
    const rule = config.headers.find(h => h.source === route);
    assert.ok(rule?.headers.some(h => h.key === 'X-Robots-Tag' && h.value === 'noindex, nofollow'), route);
  }
});
test('public pages have distinct canonical metadata while private and unknown paths are noindex', async () => {
  assert.ok(existsSync(path), 'route-specific metadata required');
  const { routeMetadata } = await import(path);
  const pages = ['/', '/host', '/challenge', '/help', '/privacy'];
  const titles = new Set();
  for (const page of pages) {
    const data = routeMetadata(page, 'www.qtrgame.net');
    assert.equal(data.robots, 'index,follow');
    assert.equal(data.canonical, `https://www.qtrgame.net${page}`);
    titles.add(data.title);
    assert.ok(data.description);
    assert.equal(routeMetadata(page, 'preview.vercel.app').robots, 'noindex,nofollow');
    assert.equal(routeMetadata(page, '127.0.0.1').canonical, null);
  }
  assert.equal(titles.size, pages.length);
  for (const page of ['/admin', '/host/ABCD', '/play/ABCDE', '/tv/ABCD', '/act/ABCD', '/missing', '/help/extra']) {
    const data = routeMetadata(page, 'www.qtrgame.net');
    assert.equal(data.robots, 'noindex,nofollow');
    assert.equal(data.canonical, null);
  }
});
