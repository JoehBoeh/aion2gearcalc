// Startet den Server mit gemockter API (Fixture) – nur für Tests/Screenshots.
import { readFileSync } from 'node:fs';
const fx = JSON.parse(readFileSync(new URL('./fixture-hokutou.json', import.meta.url), 'utf8'));
let n = 0;
globalThis.fetch = async (url) => {
  const u = new URL(url); const p = u.pathname;
  const ok = (b) => ({ ok: true, status: 200, json: async () => b });
  if (++n % 7 === 0) return { ok: false, status: 404, json: async () => ({}) }; // sporadische 404 simulieren
  if (u.hostname.startsWith('api-search')) {
    const kw = u.searchParams.get('keyword');
    return ok({ list: [{ characterId: kw === 'Klon' ? 'KLON' : 'H8WHJE_su6dZM2K913s8qhN7wyeglt5zKZUtUpo49qI%3D', name: `<strong>${kw}</strong>`, serverId: 2401 }] });
  }
  // Zweiter Test-Charakter "Klon": schwächere Waffe, andere Steine, weniger Daevanion
  if (u.searchParams.get('characterId') === 'KLON') {
    if (p.endsWith('/info')) return ok({ ...fx.info, profile: { ...fx.info.profile, characterName: 'Klon' }, stat: { statList: [{ type: 'ItemLevel', value: 2711 - 15 - 3 - 3 - 24 }] } });
    if (p.endsWith('/equipment')) return ok({ equipment: { equipmentList: fx.equipment.equipment.equipmentList.map((e) => e.slotPos === 1 ? { ...e, exceedLevel: 0 } : e) } });
    if (p.endsWith('/equipment/item') && u.searchParams.get('slotPos') === '1') return ok({ ...fx.items[1], levelValue: 15, magicStoneStat: [{ grade: 'Rare' }, { grade: 'Rare' }, { grade: 'Common' }, { grade: 'Rare' }], godStoneStat: [] });
    if (p.endsWith('/daevanion/detail') && u.searchParams.get('boardId') === '44') return ok({ nodeList: Array.from({ length: 16 }, () => ({ grade: 'Common', open: 1 })).concat(fx.boards[44].Common > 0 ? Object.entries(fx.boards[44]).flatMap(([g, k]) => Array.from({ length: g === 'Common' ? k - 40 : k }, () => ({ grade: g, open: 1 }))) : []) });
  }
  if (p.endsWith('/info')) return ok(fx.info);
  if (p.endsWith('/equipment')) return ok(fx.equipment);
  if (p.endsWith('/equipment/item')) return ok({ ...fx.items[u.searchParams.get('slotPos')], magicStoneStat: fx.items[u.searchParams.get('slotPos')].magicStoneStat.map((m) => ({ ...m, name: 'Stein', value: '+1' })) });
  if (p.endsWith('/daevanion/detail')) {
    const c = fx.boards[u.searchParams.get('boardId')];
    return ok({ nodeList: Object.entries(c).flatMap(([grade, k]) => Array.from({ length: k }, () => ({ grade, open: 1 }))) });
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
await import('../server.js');
