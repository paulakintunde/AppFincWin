// 05.3-113 (UAT gap 32): an own kind counts like the preset it is based on, the way the engine's resolveItemType does.
import { V3_ITEM_TYPES } from '@/engine/decide/v3';
import type { ItemTypeRef } from '@/engine/decide/v3';
import { itemBaseOf } from '../itemBase';
import { liveCustomOptions, parseOwnOptions } from '../ownOptions';

const ROWS = [
  { id: 'bike', name: 'Bike', base: 'vehicle' as const },
  { id: 'flat', name: 'Flat', base: 'property' as const },
];

describe('itemBaseOf', () => {
  it('returns each preset as itself', () => {
    for (const value of V3_ITEM_TYPES) {
      expect(itemBaseOf({ kind: 'preset', value }, [])).toBe(value);
      expect(itemBaseOf({ kind: 'preset', value }, ROWS)).toBe(value);
    }
    expect(V3_ITEM_TYPES.length).toBeGreaterThanOrEqual(9);
  });

  it('returns the stored base of a live own kind', () => {
    expect(itemBaseOf({ kind: 'custom', id: 'bike' }, ROWS)).toBe('vehicle');
    expect(itemBaseOf({ kind: 'custom', id: 'flat' }, ROWS)).toBe('property');
  });

  it('counts a removed or unknown own kind as General', () => {
    expect(itemBaseOf({ kind: 'custom', id: 'gone' }, ROWS)).toBe('general');
    expect(itemBaseOf({ kind: 'custom', id: 'bike' }, [])).toBe('general');
  });

  it('agrees whether the rows come from liveCustomOptions or the useOwnOptions shape', () => {
    const raw = {
      v: 1,
      itemTypes: [
        { id: 'bike', name: 'Bike', base: 'vehicle', questionIds: [], ownQuestions: [], deletedAt: null },
        { id: 'old', name: 'Old flat', base: 'property', questionIds: [], ownQuestions: [], deletedAt: '2026-10-01' },
      ],
      purposes: [],
    };
    const engineRows = liveCustomOptions(raw).itemTypes;
    const uiRows = parseOwnOptions(raw)
      .itemTypes.filter((t) => t.deletedAt === null)
      .map((t) => ({ id: t.id, name: t.name, base: t.base }));
    const refs: ItemTypeRef[] = [
      { kind: 'custom', id: 'bike' },
      { kind: 'custom', id: 'old' },
    ];
    for (const ref of refs) expect(itemBaseOf(ref, engineRows)).toBe(itemBaseOf(ref, uiRows));
    expect(itemBaseOf(refs[0], engineRows)).toBe('vehicle');
    expect(itemBaseOf(refs[1], engineRows)).toBe('general');
  });
});
