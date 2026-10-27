// Lokaler Server: node server.js  ->  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadFromShugoLink } from './api.js';
import { computeBreakdown } from './calc.js';
import { computeUpgrades } from './upgrade.js';

const PORT = Number(process.env.PORT) || 3000;
const cache = new Map(); // link -> { at, data }
const CACHE_MS = 60_000;

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, await readFile(new URL('./public/index.html', import.meta.url)), 'text/html; charset=utf-8');
    }
    if (url.pathname === '/api/breakdown') {
      const link = url.searchParams.get('url') || '';
      const fresh = url.searchParams.get('fresh') === '1';
      const hit = cache.get(link);
      if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.data);
      const t0 = Date.now();
      const raw = await loadFromShugoLink(link);
      const data = computeBreakdown(raw);
      data.fetchedAt = new Date().toISOString();
      data.upgrades = computeUpgrades(data);
      data.upgradesCraft = computeUpgrades(data, { allowCraft: true });
      cache.set(link, { at: Date.now(), data });
      console.log(`✓ ${data.character.name} (${data.character.server}) GS ${data.official} in ${Date.now() - t0} ms`);
      return send(res, 200, data);
    }
    send(res, 404, { error: 'Nicht gefunden' });
  } catch (e) {
    console.error('✗', e.message);
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`AION 2 Gearscore-Analyse läuft auf http://localhost:${PORT}`));
