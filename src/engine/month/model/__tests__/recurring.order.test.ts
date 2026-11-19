import * as fc from 'fast-check';
import { addDays } from '../../../decide/v3/dates';
import { detectCandidates, type DetectContext, type DetectRow } from '../recurring';

const EMPTY: DetectContext = { dismissedKeys: new Set(), linkedRowIds: new Set() };

function row(id: string, date: string, over: Partial<DetectRow> = {}): DetectRow {
  return { id, name: 'Acme', amount: -1500, currency: 'USD', date, isTransfer: false, accountId: 'a1', ...over };
}

// Three monthly rows per series, so every series has the same row count and ordering falls to the tie-breaks.
function series(tag: string, name: string, start: string, over: Partial<DetectRow> = {}): DetectRow[] {
  return Array.from({ length: 3 }, (_, i) => row(`${tag}-${i}`, addDays(start, 30 * i), { name, ...over }));
}

describe('detectCandidates ordering (I16)', () => {
  const rows = [
    ...series('s1', 'Acme', '2025-01-03'),
    ...series('s2', 'Acme', '2025-01-03', { accountId: 'a2' }), // same payee on another account: same name, key and anchor
    ...series('s3', 'Acme', '2025-02-10', { accountId: 'a3' }),
    ...series('s4', 'Acme', '2025-01-03', { currency: 'EUR' }),
    ...series('s5', 'Zed', '2025-01-03'),
    ...series('s6', 'Bob', '2025-01-03'),
  ];

  it('ties on row count, name, key and anchor date are ordered by first row id, whatever the input order', () => {
    const expected = detectCandidates(rows, EMPTY);
    expect(expected).toHaveLength(6);
    expect(expected.map((c) => c.name)).toEqual(['Acme', 'Acme', 'Acme', 'Acme', 'Bob', 'Zed']);
    expect(detectCandidates([...rows].reverse(), EMPTY)).toEqual(expected);
    fc.assert(
      fc.property(fc.shuffledSubarray(rows, { minLength: rows.length, maxLength: rows.length }), (shuffled) => {
        expect(detectCandidates(shuffled, EMPTY)).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('series whose first rows share an id (bad data) still sort without throwing', () => {
    const twin = [...series('x', 'Acme', '2025-01-03'), ...series('x', 'Acme', '2025-01-03', { accountId: 'a2' })];
    expect(detectCandidates(twin, EMPTY)).toHaveLength(2);
  });
});

describe('detectCandidates (05.4-60 kills)', () => {
  it('rows come back in date order whatever the input order, with ids not following dates', () => {
    const ordered = [row('c', '2025-01-03'), row('a', '2025-02-02'), row('b', '2025-03-04')];
    const want = detectCandidates(ordered, EMPTY);
    expect(want).toHaveLength(1);
    expect(want[0]?.rowIds).toEqual(['c', 'a', 'b']);
    expect(detectCandidates([...ordered].reverse(), EMPTY)[0]?.rowIds).toEqual(['c', 'a', 'b']);
    expect(detectCandidates([ordered[1] as DetectRow, ordered[2] as DetectRow, ordered[0] as DetectRow], EMPTY)[0]?.rowIds).toEqual(['c', 'a', 'b']);
  });

  it('transfers and zero amounts are never offered', () => {
    expect(detectCandidates(series('t', 'Acme', '2025-01-03', { isTransfer: true }), EMPTY)).toEqual([]);
    expect(detectCandidates(series('z', 'Acme', '2025-01-03', { amount: 0 }), EMPTY)).toEqual([]);
    const mixed = [...series('t', 'Acme', '2025-01-03', { isTransfer: true }), ...series('m', 'Acme', '2025-01-03')];
    expect(detectCandidates(mixed, EMPTY).map((c) => c.rowIds)).toEqual([['m-0', 'm-1', 'm-2']]);
  });

  it('same payee on two accounts is two groups; a pay in is "in" and a bill out is "out"', () => {
    const rows = [...series('p', 'Pay', '2025-01-03', { amount: 100000 }), ...series('q', 'Pay', '2025-01-03', { amount: 100000, accountId: 'a2' })];
    const out = detectCandidates(rows, EMPTY);
    expect(out.map((c) => [c.direction, c.rowIds.length])).toEqual([['in', 3], ['in', 3]]);
  });

  it('orders by key, then anchor date, then first row id, against the order the data would give by itself', () => {
    // two datasets so one of them has the key order opposite to the anchor/id order, whatever the keys turn out to be
    for (const flip of [false, true]) {
      const early = series(flip ? 'z' : 'a', 'Acme', '2025-01-03');
      const late = series(flip ? 'a' : 'z', 'Acme', '2025-02-10', { currency: 'EUR' });
      const out = detectCandidates([...late, ...early], EMPTY);
      expect(out).toHaveLength(2);
      expect(out.map((c) => c.key)).toEqual(out.map((c) => c.key).sort());
    }
    // same name and key on two accounts: the earlier anchor date comes first even when its ids sort later
    const lateA = series('a', 'Acme', '2025-02-10');
    const earlyZ = series('z', 'Acme', '2025-01-03', { accountId: 'a2' });
    const byAnchor = detectCandidates([...lateA, ...earlyZ], EMPTY);
    expect(byAnchor.map((c) => c.anchorDate)).toEqual(['2025-03-04', '2025-03-12']);
    expect(byAnchor[0]?.rowIds[0]).toBe('z-0');
  });
});
