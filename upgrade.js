// Verbesserungspotenzial: Was bringt wie viel Gearscore – ohne Crafting.
//
// Datengrundlage: data/catalog.json (aus ausgerüsteten Items echter Global-Charaktere
// gesammelt, siehe scripts/update-catalog.js). Pro Item: offizielle Basisstufe,
// max. Verstärkung, max. Sterne, Manastein-Slots, Quellen (z. B. "Crafting").
import { readFileSync, existsSync } from 'node:fs';
import { GRADE_POINTS, GRADE_DE, SLOT_DE } from './calc.js';

const CATALOG_URL = new URL('./data/catalog.json', import.meta.url);
let catalog = null;
export function loadCatalog() {
  if (!catalog && existsSync(CATALOG_URL)) catalog = JSON.parse(readFileSync(CATALOG_URL, 'utf8'));
  return catalog;
}

const MANA_MAX = GRADE_POINTS.Unique; // Gold = 4 je Slot
const STAR_PTS = 5;

// Slots, die sich Items teilen (Ring 1/2, Ohrring 1/2, Rune 1/2). Armband 1 und 2 nehmen
// unterschiedliche Armband-Typen auf und bleiben daher getrennt.
export const slotGroup = (slot) => (/^(Ring|Earring|Rune)[12]$/.test(slot) ? slot.slice(0, -1) : slot);

/** Item gilt als "gecraftet", wenn es ausschließlich über Crafting zu bekommen ist. */
export const isCraftOnly = (it) => it.sources.length > 0 && it.sources.every((s) => s === 'Crafting');

const usableBy = (it, cls) => !it.classNames?.length || it.classNames.includes(cls);

/** Max. Gearscore eines Items: Basis + volle Verstärkung + volle Sterne + goldene Manasteine */
export const itemMax = (it) => it.level + it.maxEnchant + STAR_PTS * it.maxExceed + MANA_MAX * it.msSlots;

/** Bestes Item je Slotgruppe für eine Klasse */
export function bestItems(cls, { allowCraft = false } = {}) {
  const cat = loadCatalog();
  const best = {};
  for (const it of Object.values(cat?.items ?? {})) {
    if (!usableBy(it, cls)) continue;
    if (!allowCraft && isCraftOnly(it)) continue;
    const g = slotGroup(it.slot);
    if (!best[g] || itemMax(it) > itemMax(best[g])) best[g] = it;
  }
  return best;
}

/**
 * @param breakdown Ergebnis von computeBreakdown()
 * @param opts.allowCraft  gecraftete Items als Ziel zulassen
 */
export function computeUpgrades(breakdown, { allowCraft = false } = {}) {
  const cat = loadCatalog();
  if (!cat) return { available: false, reason: 'Kein Item-Katalog vorhanden (data/catalog.json fehlt).' };
  const cls = breakdown.character.className;
  const best = bestItems(cls, { allowCraft });

  const slots = breakdown.items.map((i) => {
    const info = cat.items[i.id] ?? cat.items[String(i.id)];
    const maxEnch = i.maxEnchant ?? info?.maxEnchant ?? i.enchantLevel;
    const maxStars = i.maxExceed ?? info?.maxExceed ?? i.stars;
    const msSlots = i.msSlots ?? info?.msSlots ?? i.stones.length;
    const sources = i.sources ?? info?.sources ?? null;

    // 1) aktuelles Item ausreizen
    const steps = [];
    const enchGain = Math.max(0, maxEnch - i.enchantLevel);
    if (enchGain) steps.push({ kind: 'enchant', label: `Verstärkung +${i.enchantLevel} → +${maxEnch}`, gain: enchGain });
    const starGain = Math.max(0, maxStars - i.stars) * STAR_PTS;
    if (starGain) steps.push({ kind: 'stars', label: `Sterne ${i.stars} → ${maxStars}`, gain: starGain });
    const manaNow = i.manaPts;
    const manaGain = Math.max(0, MANA_MAX * msSlots - manaNow);
    if (manaGain) {
      const notGold = i.stones.filter((s) => s.grade !== 'Unique').length + Math.max(0, msSlots - i.stones.length);
      steps.push({ kind: 'mana', label: `${notGold} Manastein${notGold === 1 ? '' : 'e'} → Gold`, gain: manaGain });
    }
    const keepMax = i.total - i.godKnown + enchGain + starGain + manaGain; // ohne Götterstein
    const currentNoGod = i.total - i.godKnown;

    // 2) Wechsel auf das beste Item (ohne Crafting) – voll ausgebaut
    const b = best[slotGroup(i.slot)];
    let swap = null;
    if (b && b.id !== i.id && itemMax(b) > keepMax) {
      swap = {
        id: b.id, name: b.name, grade: b.grade, level: b.level, sources: b.sources,
        maxEnchant: b.maxEnchant, maxExceed: b.maxExceed, msSlots: b.msSlots,
        max: itemMax(b),
        // direkt nach dem Wechsel (+0, keine Sterne, keine Steine) bzw. voll ausgebaut
        gainBaseOnly: b.level - (i.base ?? 0),
        gain: itemMax(b) - currentNoGod,
      };
    }
    const potential = Math.max(keepMax, swap?.max ?? 0) - currentNoGod;
    return {
      slot: i.slot, slotDe: i.slotDe, name: i.name, grade: i.grade, current: i.total,
      keepMax, steps, keepGain: keepMax - currentNoGod, swap, potential,
      craftOnly: sources ? isCraftOnly({ sources }) : null, sources,
    };
  });

  // 3) Daevanion – alle Knoten öffnen
  const boardLayout = cat.boards?.[cls] ?? cat.boards?.default ?? null;
  const boards = breakdown.boards.map((b, idx) => {
    const layout = boardLayout?.find((x) => x.name === b.name) ?? boardLayout?.[idx];
    if (!layout) return { name: b.name, current: b.points, max: null, gain: null, missing: null };
    const missing = {};
    let gain = 0;
    for (const [g, total] of Object.entries(layout.counts)) {
      const m = Math.max(0, total - (b.counts[g] ?? 0));
      if (m) missing[g] = m;
      gain += m * (GRADE_POINTS[g] ?? 0);
    }
    return { name: b.name, current: b.points, max: b.points + gain, gain, missing };
  });

  const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] ?? 0), 0);
  const gearGain = sum(slots, 'potential');
  const dvGain = sum(boards, 'gain');
  const current = breakdown.official ?? breakdown.computed;
  const byKind = { enchant: 0, stars: 0, mana: 0 };
  for (const s of slots) if (!s.swap || s.keepMax >= s.swap.max) for (const st of s.steps) byKind[st.kind] += st.gain;
  const swapGain = slots.reduce((a, s) => a + (s.swap && s.swap.max > s.keepMax ? s.potential : 0), 0);

  // Top-Empfehlungen: einzelne Schritte, nach Gewinn sortiert
  const actions = [];
  for (const s of slots) {
    if (s.swap && s.swap.max > s.keepMax) {
      actions.push({ slot: s.slotDe, kind: 'swap', label: `${s.swap.name} besorgen & voll ausbauen`, gain: s.potential, detail: s.swap.sources.join(', ') });
    } else for (const st of s.steps) actions.push({ slot: s.slotDe, kind: st.kind, label: st.label, gain: st.gain });
  }
  for (const b of boards) if (b.gain) actions.push({ slot: `Daevanion ${b.name}`, kind: 'daevanion', label: `${Object.values(b.missing).reduce((a, n) => a + n, 0)} Knoten öffnen (` + Object.entries(b.missing).map(([g, n]) => `${n}× ${GRADE_DE[g] ?? g}`).join(', ') + ')', gain: b.gain });
  actions.sort((a, b) => b.gain - a.gain);

  return {
    available: true,
    allowCraft,
    catalog: { updatedAt: cat.updatedAt, characters: cat.characterCount, items: Object.keys(cat.items).length },
    current,
    maxGear: current + gearGain,
    max: current + gearGain + dvGain,
    gains: { ...byKind, swap: swapGain, daevanion: dvGain, gear: gearGain, total: gearGain + dvGain },
    slots, boards, actions,
    notes: [
      'Göttersteine sind nicht eingerechnet (Wert je Stein unbekannt).',
      'Manasteine: Ziel ist Gold (4 GS je Slot).',
    ],
  };
}

export { SLOT_DE };
