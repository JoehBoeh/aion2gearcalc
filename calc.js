// Reine Rechenlogik: nimmt die Rohdaten der offiziellen AION-2-API und
// schlüsselt den Gearscore ("Item Level") nach Herkunft auf.
//
// Regeln (empirisch an mehreren Charakteren verifiziert, Okt. 2026):
//   Item        = Basis (item.level) + Verstärkung (+1 je Stufe) + Sterne (+5 je Stern)
//   Manastein   = Weiß 1 · Grün 2 · Blau 3 · Gold 4
//   Daevanion   = je geöffnetem Knoten: Weiß 1 · Grün 2 · Blau 3 · Gold 4
//   Götterstein = Grün 3 (bestätigt); Blau/Gold variieren je Stein -> werden aus
//                 der Differenz zum offiziellen Gesamtwert ermittelt.

export const GRADE_POINTS = { Common: 1, Rare: 2, Legend: 3, Unique: 4 };
export const GODSTONE_POINTS = { Rare: 3 }; // Rest unbekannt -> Differenz

export const GRADE_DE = {
  Common: 'Weiß', Rare: 'Grün', Legend: 'Blau', Unique: 'Gold', Epic: 'Orange',
  Special: 'Spezial', None: '–',
};

export const SLOT_DE = {
  MainHand: 'Waffe', SubHand: 'Nebenhand', Helmet: 'Helm', Shoulder: 'Schultern',
  Torso: 'Brust', Pants: 'Hose', Gloves: 'Handschuhe', Boots: 'Schuhe', Cape: 'Umhang',
  Belt: 'Gürtel', Necklace: 'Halskette', Earring1: 'Ohrring 1', Earring2: 'Ohrring 2',
  Ring1: 'Ring 1', Ring2: 'Ring 2', Bracelet1: 'Armband 1', Bracelet2: 'Armband 2',
  Rune1: 'Rune 1', Rune2: 'Rune 2', Amulet: 'Amulett',
  Arcana1: 'Arcana 1', Arcana2: 'Arcana 2', Arcana3: 'Arcana 3', Arcana4: 'Arcana 4', Arcana5: 'Arcana 5',
};

const SLOT_ORDER = Object.keys(SLOT_DE);

/**
 * @param {object} raw
 *   raw.info       – /api/character/info
 *   raw.equipment  – /api/character/equipment
 *   raw.items      – { [slotPos]: /api/character/equipment/item | null }
 *   raw.boards     – { [boardId]: /api/character/daevanion/detail | null }
 */
export function computeBreakdown(raw) {
  const profile = raw.info.profile;
  const official = raw.info.stat?.statList?.find((s) => s.type === 'ItemLevel')?.value ?? null;
  const warnings = [];

  // ---------- Ausrüstung ----------
  const equipList = raw.equipment?.equipment?.equipmentList ?? [];
  const items = equipList.map((e) => {
    const d = raw.items?.[e.slotPos];
    const ench = e.enchantLevel || 0;
    const stars = e.exceedLevel || 0;
    if (!d) {
      warnings.push(`Details für ${SLOT_DE[e.slotPosName] || e.slotPosName} (${e.name}) konnten nicht geladen werden.`);
    }
    const base = d?.level ?? null;
    // levelValue = Verstärkung + 5 je Stern (von der API berechnet)
    const lv = d?.levelValue ?? ench + 5 * stars;
    const enchantPts = Math.min(ench, lv);
    const starPts = lv - enchantPts;

    const stones = (d?.magicStoneStat ?? []).map((m) => ({
      name: m.name, value: m.value, grade: m.grade, points: GRADE_POINTS[m.grade] ?? null,
    }));
    stones.forEach((s) => {
      if (s.points == null) warnings.push(`Unbekannte Manastein-Seltenheit "${s.grade}" auf ${e.name}.`);
    });
    const manaPts = stones.reduce((a, s) => a + (s.points ?? 0), 0);

    const godstones = (d?.godStoneStat ?? []).map((g) => ({
      name: g.name, grade: g.grade, points: GODSTONE_POINTS[g.grade] ?? null,
    }));
    const godKnown = godstones.reduce((a, g) => a + (g.points ?? 0), 0);

    return {
      id: e.id,
      maxEnchant: d?.maxEnchantLevel ?? null,
      maxExceed: d?.maxExceedEnchantLevel ?? null,
      msSlots: d?.magicStoneSlotCount ?? null,
      sources: d?.sources ?? null,
      slot: e.slotPosName,
      slotDe: SLOT_DE[e.slotPosName] || e.slotPosName,
      slotPos: e.slotPos,
      name: e.name,
      grade: e.grade,
      icon: e.icon,
      enchantLevel: ench,
      stars,
      base,
      enchantPts,
      starPts,
      stones,
      manaPts,
      godstones,
      godKnown,
      total: (base ?? 0) + enchantPts + starPts + manaPts + godKnown,
      loaded: !!d,
    };
  });
  items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  // ---------- Daevanion ----------
  const boardList = raw.info.daevanion?.boardList ?? [];
  const boards = boardList.map((b) => {
    const d = raw.boards?.[b.id];
    const counts = { Common: 0, Rare: 0, Legend: 0, Unique: 0 };
    const other = {};
    if (b.open && !d) warnings.push(`Daevanion-Brett ${b.name} konnte nicht geladen werden.`);
    for (const n of d?.nodeList ?? []) {
      if (!n.open) continue;
      if (n.grade in counts) counts[n.grade]++;
      else if (n.grade !== 'None') other[n.grade] = (other[n.grade] || 0) + 1;
    }
    for (const g of Object.keys(other)) warnings.push(`Unbekannte Knoten-Seltenheit "${g}" auf Brett ${b.name}.`);
    const pts = Object.entries(counts).reduce((a, [g, c]) => a + c * GRADE_POINTS[g], 0);
    return {
      id: b.id, name: b.name, icon: b.icon,
      openNodes: b.openNodeCount, totalNodes: b.totalNodeCount,
      counts, points: pts, loaded: !b.open || !!d,
    };
  });

  // ---------- Summen ----------
  const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] ?? 0), 0);
  const totals = {
    base: sum(items, 'base'),
    enchant: sum(items, 'enchantPts'),
    stars: sum(items, 'starPts'),
    manastones: sum(items, 'manaPts'),
    godstonesKnown: sum(items, 'godKnown'),
    daevanion: sum(boards, 'points'),
  };
  const computed = Object.values(totals).reduce((a, b) => a + b, 0);
  const unknownGodstones = items.flatMap((i) => i.godstones.filter((g) => g.points == null).map((g) => ({ ...g, slot: i.slotDe })));
  const diff = official != null ? official - computed : null;

  let godstonesFromDiff = null;
  if (diff != null && unknownGodstones.length) {
    godstonesFromDiff = diff; // Rest wird den Göttersteinen mit unbekanntem Wert zugeordnet
  } else if (diff && !unknownGodstones.length) {
    warnings.push(`Berechnete Summe weicht um ${diff > 0 ? '+' : ''}${diff} vom offiziellen Wert ab (evtl. hat sich der Charakter gerade geändert – neu laden).`);
  }

  return {
    character: {
      name: profile.characterName,
      className: profile.className,
      level: profile.characterLevel,
      server: profile.serverName,
      serverId: profile.serverId,
      race: profile.raceName,
      combatPower: profile.combatPower,
      image: profile.profileImage,
    },
    official,
    computed,
    diff,
    totals: { ...totals, godstonesFromDiff },
    unknownGodstones,
    items,
    boards,
    warnings,
  };
}
