// Kommandozeile: node cli.js "https://shugo.gg/de/character/global/eu-siel/Name"
// Vergleich:     node cli.js <link1> <link2>
import { loadFromShugoLink } from './api.js';
import { computeBreakdown, GRADE_DE } from './calc.js';
import { computeUpgrades } from './upgrade.js';

const link = process.argv[2];
if (!link) {
  console.error('Aufruf: node cli.js <shugo.gg-Charakterlink>');
  process.exit(1);
}

if (process.argv[3]) {
  const [a, b] = await Promise.all(process.argv.slice(2, 4).map(async (l) => computeBreakdown(await loadFromShugoLink(l))));
  const god = (d) => d.totals.godstonesKnown + (d.totals.godstonesFromDiff ?? 0);
  const sg = (v) => (v > 0 ? '+' : '') + v;
  const row = (label, x, y) => console.log(`${label.padEnd(14)} ${String(x).padStart(6)} ${String(y).padStart(6)} ${sg(y - x).padStart(6)}`);
  console.log(`\n${''.padEnd(14)} ${a.character.name.slice(0, 6).padStart(6)} ${b.character.name.slice(0, 6).padStart(6)}      Δ`);
  const t = (d) => d.totals;
  row('Basis', t(a).base, t(b).base); row('Verstärkung', t(a).enchant, t(b).enchant); row('Sterne', t(a).stars, t(b).stars);
  row('Manasteine', t(a).manastones, t(b).manastones); row('Göttersteine', god(a), god(b)); row('Daevanion', t(a).daevanion, t(b).daevanion);
  row('GESAMT', a.official, b.official);
  console.log('\nUnterschiede je Slot:');
  for (const ia of a.items) {
    const ib = b.items.find((i) => i.slot === ia.slot);
    const d = (ib?.total ?? 0) - ia.total;
    if (d || ia.name !== ib?.name) console.log(`  ${ia.slotDe.padEnd(11)} ${String(ia.total).padStart(4)} → ${String(ib?.total ?? 0).padStart(4)} (${sg(d)})  ${ia.name} → ${ib?.name ?? '–'}`);
  }
  process.exit(0);
}

const r = computeBreakdown(await loadFromShugoLink(link));
const c = r.character;
console.log(`\n${c.name} – ${c.className} Lv${c.level} – ${c.server}   Gearscore ${r.official}\n`);

for (const i of r.items) {
  const parts = [`${i.base} (Basis)`];
  if (i.enchantPts) parts.push(`${i.enchantPts} (Verstärkung)`);
  if (i.starPts) parts.push(`${i.starPts} (${i.stars} Sterne)`);
  if (i.stones.length) parts.push(`${i.manaPts} (Manasteine: ${i.stones.map((s) => GRADE_DE[s.grade]).join('/')})`);
  for (const g of i.godstones) parts.push(`${g.points ?? '?'} (Götterstein ${GRADE_DE[g.grade]})`);
  console.log(`${i.slotDe.padEnd(11)} ${i.name.slice(0, 38).padEnd(38)} ${String(i.total).padStart(4)} = ${parts.join(' + ')}`);
}
console.log('\nDaevanion:');
for (const b of r.boards) {
  const cnt = Object.entries(b.counts).filter(([, n]) => n).map(([g, n]) => `${n}× ${GRADE_DE[g]}`).join(', ');
  console.log(`  ${b.name.padEnd(10)} ${String(b.points).padStart(4)}   ${cnt || '–'}`);
}
const t = r.totals;
console.log(`\nSumme: Basis ${t.base} + Verstärkung ${t.enchant} + Sterne ${t.stars} + Manasteine ${t.manastones} + Göttersteine ${t.godstonesKnown + (t.godstonesFromDiff ?? 0)}${t.godstonesFromDiff != null ? '*' : ''} + Daevanion ${t.daevanion} = ${r.computed + (t.godstonesFromDiff ?? 0)}  (offiziell ${r.official})`);
if (t.godstonesFromDiff != null) console.log('* Wert der blauen/goldenen Göttersteine aus der Differenz zum offiziellen Gearscore ermittelt.');
for (const w of r.warnings) console.log('⚠ ' + w);

const u = computeUpgrades(r);
if (u.available) {
  const uc = computeUpgrades(r, { allowCraft: true });
  console.log(`\nVerbesserungspotenzial ohne Crafting: ${u.current} → ${u.max} (+${u.gains.total}; nur Ausrüstung ${u.maxGear}, mit Crafting ${uc.max})`);
  for (const a of u.actions.slice(0, 10)) console.log(`  +${String(a.gain).padStart(3)}  ${a.slot.padEnd(18)} ${a.label}`);
}
