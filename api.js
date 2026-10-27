// Datenabruf über die offizielle AION-2-API (dieselbe Quelle, die shugo.gg nutzt).
import { readFileSync } from 'node:fs';

const SERVERS = JSON.parse(readFileSync(new URL('./servers.json', import.meta.url), 'utf8'));
const SUBREGIONS = { 1: 'nae', 2: 'naw', 3: 'eu', 4: 'la', 5: 'as' };
const API = 'https://aion2.plaync.com';
const SEARCH = 'https://api-search.plaync.com/aion2global/search/v2/character';
const LANG = 'en-US';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://aion2.plaync.com/en-us/characters',
  Origin: 'https://aion2.plaync.com',
};

export function subRegionOf(serverId) {
  const s = String(serverId);
  return /^[12]\d{3}$/.test(s) ? SUBREGIONS[s[1]] ?? null : null;
}

// "eu-siel" -> 1301
const SLUG_TO_ID = {};
for (const [id, name] of Object.entries(SERVERS)) {
  const sub = subRegionOf(id);
  if (sub) SLUG_TO_ID[`${sub}-${name.toLowerCase().replace(/\s+/g, '-')}`] = Number(id);
}

/**
 * Akzeptiert z. B.
 *   https://shugo.gg/de/character/global/eu-siel/Asulgard
 *   https://shugo.gg/character/global/eu-siel/Asulgard?tab=stats
 *   https://shugo.gg/de/character?id=...&server=1301&region=GLOBAL&name=...
 */
export function parseShugoUrl(input) {
  let url;
  try {
    url = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`);
  } catch {
    throw new Error('Das sieht nicht nach einem gültigen Link aus.');
  }
  if (!/(^|\.)shugo\.gg$/i.test(url.hostname)) throw new Error('Bitte einen shugo.gg-Link einfügen.');

  const id = url.searchParams.get('id');
  if (id) {
    const serverId = Number(url.searchParams.get('server'));
    return { characterId: decodeURIComponent(id), serverId, name: url.searchParams.get('name') || null };
  }

  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const i = parts.indexOf('character');
  if (i < 0 || parts.length < i + 4) throw new Error('Link enthält keinen Charakter (erwartet …/character/global/eu-server/Name).');
  const [region, serverSlug, name] = parts.slice(i + 1, i + 4);
  if (region.toLowerCase() !== 'global') {
    throw new Error(`Region "${region}" wird nicht unterstützt – nur Global (EU/NA/SA/Asien).`);
  }
  const serverId = SLUG_TO_ID[serverSlug.toLowerCase()] ?? (/^\d{4}$/.test(serverSlug) ? Number(serverSlug) : null);
  if (!serverId) throw new Error(`Unbekannter Server "${serverSlug}".`);
  return { characterId: null, serverId, name };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { retries = 4, allow404 = false } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status} für ${url.split('?')[0]}`);
      last.status = res.status;
      // Die API liefert sporadisch 404/429/5xx – kurz warten und erneut versuchen.
      if (res.status === 404 && allow404 && attempt === retries) return null;
    } catch (e) {
      last = e;
    }
    await sleep(400 * 2 ** attempt + Math.random() * 200);
  }
  throw last;
}

async function pool(tasks, limit = 4) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

export async function findCharacterId(name, serverId) {
  const region = subRegionOf(serverId);
  const q = new URLSearchParams({ keyword: name, page: '1', size: '50', localeInfo: LANG, region, serverId: String(serverId) });
  const data = await getJson(`${SEARCH}?${q}`);
  const clean = (s) => String(s || '').replace(/<[^>]+>/g, '');
  const hit = (data.list || []).find((c) => clean(c.name).toLowerCase() === name.toLowerCase() && Number(c.serverId) === serverId);
  if (!hit) throw new Error(`Charakter "${name}" auf Server ${SERVERS[serverId]} (${region.toUpperCase()}) nicht gefunden.`);
  return decodeURIComponent(hit.characterId);
}

export async function fetchRaw({ characterId, serverId }) {
  const region = subRegionOf(serverId);
  const q = `characterId=${encodeURIComponent(characterId)}&serverId=${serverId}&region=${region}`;
  const bust = `&_t=${Date.now()}`;

  const [info, equipment] = await Promise.all([
    getJson(`${API}/api/character/info?lang=${LANG}&${q}${bust}`),
    getJson(`${API}/api/character/equipment?lang=${LANG}&${q}${bust}`),
  ]);

  const list = equipment?.equipment?.equipmentList ?? [];
  const itemTasks = list.map((e) => async () => {
    const el = (e.enchantLevel || 0) + (e.exceedLevel || 0);
    const url = (lvl) => `${API}/api/character/equipment/item?id=${e.id}&enchantLevel=${lvl}&characterId=${encodeURIComponent(characterId)}&serverId=${serverId}&slotPos=${e.slotPos}&lang=${LANG}&region=${region}`;
    try {
      return [e.slotPos, await getJson(url(el), { allow404: true })];
    } catch {
      // Fallback: Item ohne Verstärkung abfragen (Basis + Manasteine bleiben korrekt,
      // Verstärkung/Sterne werden dann aus enchantLevel/exceedLevel berechnet).
      try {
        const d = await getJson(url(0), { retries: 2 });
        if (d) d.levelValue = undefined;
        return [e.slotPos, d];
      } catch {
        return [e.slotPos, null];
      }
    }
  });

  const boardTasks = (info?.daevanion?.boardList ?? [])
    .filter((b) => b.open)
    .map((b) => async () => {
      try {
        return [b.id, await getJson(`${API}/api/character/daevanion/detail?lang=${LANG}&${q}&boardId=${b.id}`)];
      } catch {
        return [b.id, null];
      }
    });

  const results = await pool([...itemTasks, ...boardTasks], 4);
  const items = Object.fromEntries(results.slice(0, itemTasks.length));
  const boards = Object.fromEntries(results.slice(itemTasks.length));
  return { info, equipment, items, boards };
}

export async function loadFromShugoLink(link) {
  const ref = parseShugoUrl(link);
  if (!ref.characterId) ref.characterId = await findCharacterId(ref.name, ref.serverId);
  return fetchRaw(ref);
}
