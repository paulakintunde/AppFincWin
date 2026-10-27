import * as fc from 'fast-check';
import { addDays } from '../../dates';
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
