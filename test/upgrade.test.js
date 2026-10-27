// node test/upgrade.test.js
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { computeBreakdown } from '../calc.js';
import { computeUpgrades, bestItems } from '../upgrade.js';

const fx = JSON.parse(readFileSync(new URL('./fixture-hokutou.json', import.meta.url), 'utf8'));
for (const [id, counts] of Object.entries(fx.boards)) {
  fx.boards[id] = { nodeList: Object.entries(counts).flatMap(([grade, n]) => Array.from({ length: n }, () => ({ grade, open: 1 }))) };
}
const b = computeBreakdown(fx);
const u = computeUpgrades(b);
const uc = computeUpgrades(b, { allowCraft: true });

// Ohne Crafting: bester Dolch ist der Enraged Kromede (86), mit Crafting der Splendent (102)
assert.equal(bestItems('Assassin').MainHand.level, 86);
assert.equal(bestItems('Assassin', { allowCraft: true }).MainHand.level, 102);
// Waffe +15 ★3 -> max ★5 (+10) und Manasteine LLRR (10) -> Gold (16) = +6
const w = u.slots.find((s) => s.slot === 'MainHand');
assert.equal(w.keepGain, 16);
assert.equal(w.swap, null);
// Brust +11, ohne Sterne, RRRR(8): +4 Verst. +25 Sterne +8 MS = +37
assert.equal(u.slots.find((s) => s.slot === 'Torso').potential, 37);
// Ohrring 2 Aulamus (70) -> Enraged Kromede Ohrring (86) voll ausgebaut = 142
const e2 = u.slots.find((s) => s.slot === 'Earring2');
assert.equal(e2.swap.name, 'Enraged Kromede Earrings');
assert.equal(e2.potential, 142 - (70 + 10 + 6));
// Daevanion: 278 von 376 Punkten genutzt -> 98 übrig; Ariel max. 60 (1 offen -> +59),
// Rest (39) geht auf Azphel (zweithöchster Ø-Wert je Knoten)
assert.equal(u.daevanion.used, 278);
assert.equal(u.daevanion.left, 98);
const ariel = u.boards.find((b) => b.name === 'Ariel'), azphel = u.boards.find((b) => b.name === 'Azphel');
assert.equal(ariel.cap, 60);
assert.equal(ariel.add, 59);
assert.equal(azphel.add, 39);
assert.equal(u.gains.daevanion, 90 + 58);
assert.ok(uc.max > u.max, 'mit Crafting muss mehr möglich sein');
console.log('jetzt', u.current, '| max ohne Crafting', u.max, '(Ausrüstung', u.maxGear + ')', '| mit Crafting', uc.max, '(Ausrüstung', uc.maxGear + ')');
console.log('Hebel:', u.gains);
console.log('OK');
