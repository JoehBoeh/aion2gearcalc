// Baut data/catalog.json neu aus aktuellen Global-Daten:
//   node scripts/update-catalog.js            (Standard: 8 Klassen × mehrere Ranglisten-Seiten)
//   node scripts/update-catalog.js --deep     (mehr Charaktere, dauert länger)
//
// Quelle der Charakterliste: shugo.gg-Rangliste (Global). Items & Daevanion-Bretter:
// offizielle AION-2-API. Erfasst wird jedes ausgerüstete Item mit offizieller Basisstufe,
// max. Verstärkung/Sterne, Manastein-Slots und Quellen (z. B. "Crafting").
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { subRegionOf } from '../api.js';

const API = 'https://aion2.plaync.com';
const LB = 'https://shugo.gg/api/leaderboard/combat-power';
const CLASSES = ['Gladiator', 'Templar', 'Assassin', 'Ranger', 'Sorcerer', 'Spiritmaster', 'Cleric', 'Chanter'];
const deep = process.argv.includes('--deep');
const PAGES = deep ? [1, 2, 3, 5, 10, 20, 40, 80, 150, 300] : [1, 3, 15, 60, 200];
const PER_PAGE = deep ? 4 : 2;
const OUT = new URL('../data/catalog.json', import.meta.url);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url, { minGap = 250 } = {}) {
  for (let i = 0; i < 6; i++) {
    const wait = Math.max(0, last + minGap - Date.now());
    if (wait) await sleep(wait);
    last = Date.now();
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.ok) return await r.json();
      if (r.status === 404) return null; // Item nicht (mehr) ausgerüstet
      if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
    } catch { /* retry */ }
    await sleep(800 * (i + 1));
  }
  return null;
}

const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const cat = { updatedAt: new Date().toISOString(), characterCount: 0, items: {}, boards: old?.boards ?? {} };

const targets = [];
for (const cls of CLASSES) {
  for (const page of PAGES) {
    const lb = await get(`${LB}?region=GLOBAL&limit=10&page=${page}&class=${cls}`, { minGap: 500 });
    for (const e of (lb?.entries ?? []).slice(0, page === 1 ? PER_PAGE + 1 : PER_PAGE)) targets.push({ cls, id: e.characterId, serverId: e.serverId, name: e.name });
  }
}
console.log(`${targets.length} Charaktere werden ausgewertet …`);

const boardsDone = new Set();
let maxNodes = 0;
for (const [n, t] of targets.entries()) {
  const region = subRegionOf(t.serverId);
  if (!region) continue;
  const q = `characterId=${encodeURIComponent(t.id)}&serverId=${t.serverId}&region=${region}`;
  const eq = await get(`${API}/api/character/equipment?lang=en-US&${q}`);
  if (!eq) continue;
  cat.characterCount++;
  for (const e of eq.equipment?.equipmentList ?? []) {
    const known = cat.items[e.id];
    if (known) { if (!known.seenBy.includes(t.cls)) known.seenBy.push(t.cls); continue; }
    const d = await get(`${API}/api/character/equipment/item?id=${e.id}&enchantLevel=0&slotPos=${e.slotPos}&lang=en-US&${q}`);
    if (!d) continue;
    cat.items[e.id] = {
      id: e.id, name: d.name, grade: d.grade, slot: e.slotPosName, category: d.categoryName,
      level: d.level, maxEnchant: d.maxEnchantLevel ?? 0, maxExceed: d.maxExceedEnchantLevel ?? 0,
      msSlots: d.magicStoneSlotCount ?? 0, classNames: d.classNames ?? [], sources: d.sources ?? [], seenBy: [t.cls],
    };
  }
  const info = await get(`${API}/api/character/info?lang=en-US&${q}`);
  const nodes = (info?.daevanion?.boardList ?? []).reduce((a, b) => a + (b.openNodeCount || 0), 0);
  maxNodes = Math.max(maxNodes, nodes);
  if (!boardsDone.has(t.cls)) {
    const list = [];
    for (const b of info?.daevanion?.boardList ?? []) {
      const d = await get(`${API}/api/character/daevanion/detail?lang=en-US&${q}&boardId=${b.id}`);
      if (!d) { list.length = 0; break; }
      const counts = {};
      for (const node of d.nodeList) if (node.grade !== 'None') counts[node.grade] = (counts[node.grade] || 0) + 1;
      list.push({ id: b.id, name: b.name, total: b.totalNodeCount, counts });
    }
    if (list.length) { cat.boards[t.cls] = list; boardsDone.add(t.cls); }
  }
  process.stdout.write(`\r${n + 1}/${targets.length}  Items: ${Object.keys(cat.items).length}   `);
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify(cat, null, 1));

// Daevanion-Gesamtbudget = höchste beobachtete Knotenzahl (Brett-Limits bleiben unverändert)
const LIM = new URL('../data/limits.json', import.meta.url);
const lim = existsSync(LIM) ? JSON.parse(readFileSync(LIM, 'utf8')) : { boardCaps: {} };
if (maxNodes > (lim.totalPoints ?? 0)) {
  lim.totalPoints = maxNodes;
  lim.source = `totalPoints = höchste Zahl geöffneter Daevanion-Knoten in der Stichprobe (${new Date().toLocaleDateString('de-DE')}). Werte hier anpassen.`;
  writeFileSync(LIM, JSON.stringify(lim, null, 2));
  console.log(`Daevanion-Gesamtbudget auf ${maxNodes} Punkte angehoben.`);
}
console.log(`\nFertig: ${Object.keys(cat.items).length} Items aus ${cat.characterCount} Charakteren → data/catalog.json`);
