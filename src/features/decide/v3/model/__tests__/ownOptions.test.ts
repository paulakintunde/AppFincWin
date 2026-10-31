import { PRESET_QUESTIONS, validateCustomOptions } from '@/engine/decide/v3';
import {
  OWN_LIVE_MAX,
  OWN_NAME_MAX,
  OWN_STORED_MAX,
  addOwnItemType,
  addOwnPurpose,
  liveCustomOptions,
  ownLabels,
  parseOwnOptions,
  removeOwnOption,
  renameOwnOption,
  setOwnItemTypeBase,
  type StoredOwnOptions,
} from '../ownOptions';

const EMPTY: StoredOwnOptions = { v: 1, itemTypes: [], purposes: [] };

function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
}

describe('parseOwnOptions', () => {
  it.each([[null], [undefined], [[]], ['x'], [5], [{}], [{ itemTypes: 'x', purposes: 4 }]])('%j gives empty lists', (raw) => {
    expect(parseOwnOptions(raw)).toEqual(EMPTY);
  });

  it('drops bad entries and keeps good ones', () => {
    const out = parseOwnOptions({
      itemTypes: [
        null,
        { id: '', name: 'A', base: 'general' },
        { id: 'a', name: '   ', base: 'general' },
        { id: 'b', name: 'x'.repeat(OWN_NAME_MAX + 1), base: 'general' },
        { id: 'c', name: 'N', base: 'nope' },
        { id: 'd', name: 5, base: 'general' },
        {
          id: 'e', name: ' Bike ', base: 'vehicle', questionIds: ['q', 3],
          ownQuestions: [
            null,
            { id: '', label: 'l', cadence: 'monthly', cash: true },
            { id: 'o1', label: 5, cadence: 'monthly', cash: true },
            { id: 'o2', label: 'l', cadence: 'daily', cash: true },
            { id: 'o3', label: 'l', cadence: 'monthly', cash: 'y' },
            { id: 'o4', label: 'l', cadence: 'yearly', cash: false },
          ],
          deletedAt: 'x',
        },
        { id: 'f', name: 'Plain', base: 'general' },
      ],
      purposes: [null, { id: 'p', name: '' }, { id: '', name: 'n' }, { id: 'p1', name: 'Kids', deletedAt: '' }, { id: 'p2', name: 'Done', deletedAt: '2026-10-01' }],
    });
    expect(out.itemTypes.map((t) => t.id)).toEqual(['e', 'f']);
    expect(out.itemTypes[0]).toEqual({
      id: 'e', name: 'Bike', base: 'vehicle', questionIds: ['q'],
      ownQuestions: [{ id: 'o4', label: 'l', cadence: 'yearly', cash: false }], deletedAt: 'x',
    });
    expect(out.itemTypes[1]).toMatchObject({ questionIds: [], ownQuestions: [], deletedAt: null });
    expect(out.purposes).toEqual([
      { id: 'p1', name: 'Kids', deletedAt: null },
      { id: 'p2', name: 'Done', deletedAt: '2026-10-01' },
    ]);
  });
});

describe('addOwnItemType and addOwnPurpose', () => {
  it('adds an item type with the base preset questions', () => {
    const r = must(addOwnItemType(EMPTY, { id: 'i1', name: '  Bike ', base: 'vehicle' }));
    expect(r.next.itemTypes).toHaveLength(1);
    expect(r.next.itemTypes[0]).toMatchObject({ id: 'i1', name: 'Bike', base: 'vehicle', ownQuestions: [], deletedAt: null });
    expect(r.next.itemTypes[0]!.questionIds.length).toBeGreaterThan(0);
  });

  it('refuses a name outside 1..40, a taken name (case and spaces ignored), and the 11th live entry', () => {
    expect(addOwnItemType(EMPTY, { id: 'a', name: '  ', base: 'general' })).toEqual({ ok: false, reason: 'name_length' });
    expect(addOwnItemType(EMPTY, { id: 'a', name: 'x'.repeat(41), base: 'general' })).toEqual({ ok: false, reason: 'name_length' });
    const one = must(addOwnItemType(EMPTY, { id: 'a', name: 'Bike', base: 'general' })).next;
    expect(addOwnItemType(one, { id: 'b', name: ' bIKE ', base: 'general' })).toEqual({ ok: false, reason: 'name_taken' });
    let full = EMPTY;
    for (let i = 0; i < OWN_LIVE_MAX; i += 1) full = must(addOwnItemType(full, { id: `i${i}`, name: `T${i}`, base: 'general' })).next;
    expect(addOwnItemType(full, { id: 'z', name: 'Extra', base: 'general' })).toEqual({ ok: false, reason: 'too_many' });
  });

  it('lets a deleted name be reused and does not count deleted entries toward the live cap', () => {
    let s = EMPTY;
    for (let i = 0; i < OWN_LIVE_MAX; i += 1) s = must(addOwnItemType(s, { id: `i${i}`, name: `T${i}`, base: 'general' })).next;
    s = removeOwnOption(s, 'itemType', 'i0', '2026-10-01');
    expect(must(addOwnItemType(s, { id: 'n', name: 'T0', base: 'general' })).next.itemTypes).toHaveLength(OWN_LIVE_MAX + 1);
  });

  it('adds purposes with the same rules', () => {
    const one = must(addOwnPurpose(EMPTY, { id: 'p1', name: ' For the kids ' })).next;
    expect(one.purposes).toEqual([{ id: 'p1', name: 'For the kids', deletedAt: null }]);
    expect(addOwnPurpose(one, { id: 'p2', name: 'for the KIDS' })).toEqual({ ok: false, reason: 'name_taken' });
    expect(addOwnPurpose(one, { id: 'p2', name: '' })).toEqual({ ok: false, reason: 'name_length' });
    let full = EMPTY;
    for (let i = 0; i < OWN_LIVE_MAX; i += 1) full = must(addOwnPurpose(full, { id: `p${i}`, name: `P${i}` })).next;
    expect(addOwnPurpose(full, { id: 'z', name: 'Extra' })).toEqual({ ok: false, reason: 'too_many' });
  });
});

describe('renameOwnOption', () => {
  const base = must(addOwnPurpose(must(addOwnPurpose(EMPTY, { id: 'p1', name: 'One' })).next, { id: 'p2', name: 'Two' })).next;
  const withType = must(addOwnItemType(base, { id: 'i1', name: 'Bike', base: 'vehicle' })).next;

  it('renames only that entry', () => {
    const r = must(renameOwnOption(withType, 'purpose', 'p1', ' Uno '));
    expect(r.next.purposes.map((p) => p.name)).toEqual(['Uno', 'Two']);
    expect(r.next.itemTypes).toEqual(withType.itemTypes);
    const t = must(renameOwnOption(withType, 'itemType', 'i1', 'Car'));
    expect(t.next.itemTypes[0]!.name).toBe('Car');
    expect(t.next.purposes).toEqual(withType.purposes);
  });

  it('leaves a second item type untouched', () => {
    const two = must(addOwnItemType(withType, { id: 'i2', name: 'Boat', base: 'vehicle' })).next;
    const r = must(renameOwnOption(two, 'itemType', 'i2', 'Ship'));
    expect(r.next.itemTypes.map((t) => t.name)).toEqual(['Bike', 'Ship']);
  });

  it('allows the same name on itself and refuses a clash, a bad length and an unknown or deleted id', () => {
    must(renameOwnOption(withType, 'purpose', 'p1', 'one'));
    expect(renameOwnOption(withType, 'purpose', 'p1', 'TWO')).toEqual({ ok: false, reason: 'name_taken' });
    expect(renameOwnOption(withType, 'purpose', 'p1', '')).toEqual({ ok: false, reason: 'name_length' });
    expect(renameOwnOption(withType, 'purpose', 'nope', 'X')).toEqual({ ok: false, reason: 'not_found' });
    const gone = removeOwnOption(withType, 'itemType', 'i1', '2026-10-01');
    expect(renameOwnOption(gone, 'itemType', 'i1', 'Y')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('removeOwnOption', () => {
  it('marks deleted and keeps the entry', () => {
    const s = must(addOwnItemType(must(addOwnPurpose(EMPTY, { id: 'p1', name: 'One' })).next, { id: 'i1', name: 'Bike', base: 'general' })).next;
    const a = removeOwnOption(s, 'purpose', 'p1', '2026-10-05');
    expect(a.purposes).toEqual([{ id: 'p1', name: 'One', deletedAt: '2026-10-05' }]);
    expect(removeOwnOption(a, 'purpose', 'p1', '2026-11-01').purposes[0]!.deletedAt).toBe('2026-10-05');
    const b = removeOwnOption(s, 'itemType', 'i1', '2026-10-05');
    expect(b.itemTypes[0]!.deletedAt).toBe('2026-10-05');
    expect(removeOwnOption(s, 'itemType', 'nope', '2026-10-05')).toEqual(s);
    expect(removeOwnOption(s, 'purpose', 'nope', '2026-10-05')).toEqual(s);
  });

  it('drops the oldest deleted entries first when more than 40 are stored, never a live one', () => {
    const purposes = Array.from({ length: OWN_STORED_MAX + 2 }, (_, i) => ({
      id: `p${i}`, name: `P${i}`, deletedAt: i < 5 ? `2026-09-0${i + 1}` : null,
    }));
    const s: StoredOwnOptions = { v: 1, itemTypes: [], purposes };
    const out = removeOwnOption(s, 'purpose', 'p41', '2026-10-01');
    expect(out.purposes).toHaveLength(OWN_STORED_MAX);
    expect(out.purposes.map((p) => p.id)).not.toContain('p0');
    expect(out.purposes.map((p) => p.id)).not.toContain('p1');
    expect(out.purposes.map((p) => p.id)).toContain('p41');
    const types: StoredOwnOptions = {
      v: 1, purposes: [],
      itemTypes: Array.from({ length: OWN_STORED_MAX + 1 }, (_, i) => ({
        id: `i${i}`, name: `T${i}`, base: 'general' as const, questionIds: [], ownQuestions: [], deletedAt: i === 3 ? '2026-09-01' : null,
      })),
    };
    expect(removeOwnOption(types, 'itemType', 'nope', 'd').itemTypes.map((t) => t.id)).not.toContain('i3');
  });
});

describe('setOwnItemTypeBase', () => {
  it('changes the base and takes that preset questions, keeping the name', () => {
    const s = must(addOwnItemType(EMPTY, { id: 'i1', name: 'Bike', base: 'general' })).next;
    const out = must(setOwnItemTypeBase(s, 'i1', 'vehicle')).next;
    expect(out.itemTypes[0]).toMatchObject({ name: 'Bike', base: 'vehicle', questionIds: PRESET_QUESTIONS.vehicle });
  });

  it('refuses an unknown or removed id', () => {
    const s = must(addOwnItemType(EMPTY, { id: 'i1', name: 'Bike', base: 'general' })).next;
    expect(setOwnItemTypeBase(s, 'nope', 'vehicle')).toEqual({ ok: false, reason: 'not_found' });
    const gone = removeOwnOption(s, 'itemType', 'i1', '2026-10-05');
    expect(setOwnItemTypeBase(gone, 'i1', 'vehicle')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('liveCustomOptions and ownLabels', () => {
  const raw = {
    v: 1,
    itemTypes: [
      { id: 'i1', name: 'Bike', base: 'vehicle', questionIds: [...PRESET_QUESTIONS.vehicle], ownQuestions: [], deletedAt: null },
      { id: 'i2', name: 'Old', base: 'general', questionIds: [], ownQuestions: [], deletedAt: '2026-10-01' },
    ],
    purposes: [{ id: 'p1', name: 'Kids', deletedAt: null }, { id: 'p2', name: 'Gone', deletedAt: '2026-10-01' }],
  };

  it('gives the engine only live options without names, and they validate', () => {
    const out = liveCustomOptions(raw);
    expect(out).toEqual({
      itemTypes: [{ id: 'i1', base: 'vehicle', questionIds: [...PRESET_QUESTIONS.vehicle], ownQuestions: [] }],
      purposes: [{ id: 'p1' }],
      cadences: [],
      incomeKinds: [],
    });
    expect(validateCustomOptions(out)).toEqual([]);
  });

  it('gives empty lists for a null column', () => {
    expect(liveCustomOptions(null)).toEqual({ itemTypes: [], purposes: [], cadences: [], incomeKinds: [] });
  });

  it('labels live options in stored order and keeps every name, deleted included', () => {
    const l = ownLabels(raw);
    expect(l.itemTypes).toEqual([{ id: 'i1', label: 'Bike' }]);
    expect(l.purposes).toEqual([{ id: 'p1', label: 'Kids' }]);
    expect([...l.allNames.entries()]).toEqual([['i1', 'Bike'], ['i2', 'Old'], ['p1', 'Kids'], ['p2', 'Gone']]);
  });
});
