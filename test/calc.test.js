// node test/calc.test.js
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { computeBreakdown } from '../calc.js';
import { parseShugoUrl } from '../api.js';

const fx = JSON.parse(readFileSync(new URL('./fixture-hokutou.json', import.meta.url), 'utf8'));
// Fixture speichert nur Knotenzahlen je Seltenheit -> wieder in nodeList umwandeln
for (const [id, counts] of Object.entries(fx.boards)) {
  fx.boards[id] = { nodeList: Object.entries(counts).flatMap(([grade, n]) => Array.from({ length: n }, () => ({ grade, open: 1 }))) };
}

const r = computeBreakdown(fx);
console.log('offiziell', r.official, 'berechnet', r.computed, 'diff', r.diff, r.totals);
assert.equal(r.official, 2711);
assert.equal(r.diff, 0, 'Summe muss exakt dem offiziellen Gearscore entsprechen');
const dagger = r.items.find((i) => i.slot === 'MainHand');
assert.deepEqual([dagger.base, dagger.enchantPts, dagger.starPts, dagger.manaPts, dagger.godKnown], [86, 15, 15, 10, 3]);
assert.equal(r.warnings.length, 0);

// URL-Parsing
assert.deepEqual(parseShugoUrl('https://shugo.gg/de/character/global/eu-siel/Asulgard'), { characterId: null, serverId: 1301, name: 'Asulgard' });
assert.deepEqual(parseShugoUrl('shugo.gg/character/global/eu-kromede/Foo%20Bar?tab=stats'), { characterId: null, serverId: 2316, name: 'Foo Bar' });
assert.equal(parseShugoUrl('https://shugo.gg/en/character/global/nae-siel/X').serverId, 1101);
assert.throws(() => parseShugoUrl('https://example.com/x'));
assert.throws(() => parseShugoUrl('https://shugo.gg/de/character/kr/siel/X'));
console.log('OK');
