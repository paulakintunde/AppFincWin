import fc from 'fast-check';
import {
  CROSS_FORMAT_WINDOW_DAYS,
  FITID_WINDOW_DAYS,
  NAME_SIMILARITY_THRESHOLD,
  findDuplicates,
  fitidReliable,
  nameSimilarity,
  type DuplicateCandidate,
  type ExistingRow,
} from '../duplicates';

function candidate(over: Partial<DuplicateCandidate> & { index: number }): DuplicateCandidate {
  return {
    localDate: '2026-09-01',
    amount: -1250,
    name: 'TESCO 123',
    externalId: null,
    ...over,
  };
}

function existingRow(over: Partial<ExistingRow> & { id: string }): ExistingRow {
  return {
    localDate: '2026-09-01',
    amount: -1250,
    name: 'Tesco 123',
    externalId: null,
    importFormat: 'csv',
    ...over,
  };
}

describe('nameSimilarity', () => {
  it('is 1 for identical normalised strings', () => {
    expect(nameSimilarity('TESCO 123', 'tesco   123')).toBe(1);
  });

  it('is 1 when one normalised string contains the other', () => {
    expect(nameSimilarity('TESCO', 'TESCO STORES 3021')).toBe(1);
  });

  it('is 0 for disjoint names', () => {
    expect(nameSimilarity('SHELL', 'TESCO')).toBe(0);
  });

  it('is 1 when both are empty', () => {
    expect(nameSimilarity('', '')).toBe(1);
  });

  it('is 0 when only one is empty', () => {
    expect(nameSimilarity('', 'TESCO')).toBe(0);
  });

  it('computes a partial Jaccard overlap for a shared token', () => {
    // tokens {tesco, store, one} vs {tesco, store, two}: intersection 2, union 4
    expect(nameSimilarity('Tesco Store One', 'Tesco Store Two')).toBeCloseTo(0.5);
  });
});

describe('fitidReliable', () => {
  it('is true when every FITID agrees on amount and date across the file', () => {
    const candidates = [
      candidate({ index: 0, externalId: 'F1', amount: -1250, localDate: '2026-09-01' }),
      candidate({ index: 1, externalId: 'F1', amount: -1250, localDate: '2026-09-01' }),
      candidate({ index: 2, externalId: 'F2', amount: -500, localDate: '2026-09-02' }),
    ];
    expect(fitidReliable(candidates)).toBe(true);
  });

  it('is false when one FITID appears on rows with different amounts', () => {
    const candidates = [
      candidate({ index: 0, externalId: 'F2', amount: -500, localDate: '2026-09-02' }),
      candidate({ index: 1, externalId: 'F2', amount: -600, localDate: '2026-09-02' }),
    ];
    expect(fitidReliable(candidates)).toBe(false);
  });

  it('is false when one FITID appears on rows with different dates', () => {
    const candidates = [
      candidate({ index: 0, externalId: 'F3', amount: -500, localDate: '2026-09-02' }),
      candidate({ index: 1, externalId: 'F3', amount: -500, localDate: '2026-09-05' }),
    ];
    expect(fitidReliable(candidates)).toBe(false);
  });

  it('is true when no candidate carries an externalId', () => {
    const candidates = [candidate({ index: 0, externalId: null })];
    expect(fitidReliable(candidates)).toBe(true);
  });
});

describe('findDuplicates', () => {
  it('flags an exact date+amount+similar-name match against an existing row', () => {
    const candidates = [candidate({ index: 0 })];
    const existing = [existingRow({ id: 'e1' })];
    const { matches, fitidDisabled } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(fitidDisabled).toBe(false);
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
  });

  it('does not flag when the name is dissimilar', () => {
    const candidates = [candidate({ index: 0, name: 'SHELL' })];
    const existing = [existingRow({ id: 'e1', name: 'TESCO' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.has(0)).toBe(false);
  });

  it('never flags either of two identical file rows when there is no existing row', () => {
    const candidates = [candidate({ index: 0 }), candidate({ index: 1 })];
    const { matches } = findDuplicates(candidates, [], { sourceFormat: 'csv' });
    expect(matches.size).toBe(0);
  });

  it('flags exactly one of two identical file rows against one similar existing row, the lower index', () => {
    const candidates = [candidate({ index: 0 }), candidate({ index: 1 })];
    const existing = [existingRow({ id: 'e1' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.size).toBe(1);
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
    expect(matches.has(1)).toBe(false);
  });

  it('flags exactly two of three identical file rows against two similar existing rows', () => {
    const candidates = [candidate({ index: 0 }), candidate({ index: 1 }), candidate({ index: 2 })];
    const existing = [existingRow({ id: 'e1' }), existingRow({ id: 'e2' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.size).toBe(2);
    expect(matches.has(0)).toBe(true);
    expect(matches.has(1)).toBe(true);
    expect(matches.has(2)).toBe(false);
    const usedIds = new Set([matches.get(0)!.id, matches.get(1)!.id]);
    expect(usedIds).toEqual(new Set(['e1', 'e2']));
  });

  it('never flags a candidate with a null date', () => {
    const candidates = [candidate({ index: 0, localDate: null })];
    const existing = [existingRow({ id: 'e1' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.has(0)).toBe(false);
  });

  it('never flags a candidate with a null amount', () => {
    const candidates = [candidate({ index: 0, amount: null })];
    const existing = [existingRow({ id: 'e1' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.has(0)).toBe(false);
  });

  it('flags a FITID match against an existing row even when the date has shifted', () => {
    const candidates = [
      candidate({ index: 0, externalId: 'F1', amount: -1250, localDate: '2026-09-04', name: 'ANY NAME' }),
    ];
    const existing = [
      existingRow({ id: 'e1', externalId: 'F1', amount: -1250, localDate: '2026-09-01', name: 'OTHER NAME' }),
    ];
    const { matches, fitidDisabled } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(fitidDisabled).toBe(false);
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'fitid' });
  });

  it('a FITID reused a month later on the same amount is not a duplicate (review E-WR-05)', () => {
    const candidates = [candidate({ index: 0, externalId: '3', amount: -999, localDate: '2026-09-05', name: 'NETFLIX' })];
    const existing = [existingRow({ id: 'e1', externalId: '3', amount: -999, localDate: '2026-08-05', name: 'NETFLIX' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.has(0)).toBe(false);
  });

  it('a FITID match holds up to FITID_WINDOW_DAYS apart and not one day more (review E-WR-05)', () => {
    const at = (localDate: string) =>
      findDuplicates(
        [candidate({ index: 0, externalId: 'F7', localDate, name: 'X' })],
        [existingRow({ id: 'e1', externalId: 'F7', localDate: '2026-09-01', name: 'Y', importFormat: 'ofx' })],
        { sourceFormat: 'ofx' }
      ).matches.get(0);
    expect(FITID_WINDOW_DAYS).toBe(7);
    expect(at('2026-09-08')).toEqual({ kind: 'existing', id: 'e1', by: 'fitid' });
    expect(at('2026-09-09')).toBeUndefined();
    expect(at('2026-08-25')).toEqual({ kind: 'existing', id: 'e1', by: 'fitid' });
  });

  it('does not use FITID when the amount differs, and falls through with no match', () => {
    const candidates = [candidate({ index: 0, externalId: 'F1', amount: -1250, localDate: '2026-09-01' })];
    const existing = [existingRow({ id: 'e1', externalId: 'F1', amount: -999, localDate: '2026-09-01' })];
    const { matches, fitidDisabled } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(fitidDisabled).toBe(false);
    expect(matches.has(0)).toBe(false);
  });

  it('disables FITID for the whole file when the file holds conflicting FITIDs, but still runs multiset matching', () => {
    const candidates = [
      candidate({ index: 0, externalId: 'F2', amount: -500, localDate: '2026-09-02', name: 'A' }),
      candidate({ index: 1, externalId: 'F2', amount: -600, localDate: '2026-09-03', name: 'B' }),
      candidate({ index: 2, externalId: 'F9', amount: -1250, localDate: '2026-09-01', name: 'TESCO 123' }),
    ];
    const existing = [existingRow({ id: 'e1', externalId: 'F9', amount: -1250, localDate: '2026-09-01' })];
    const { matches, fitidDisabled } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(fitidDisabled).toBe(true);
    // Not matched by fitid (disabled), but still matched by the multiset pass on amount/date/name.
    expect(matches.get(2)).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
  });

  it('flags a cross-format window match against a row imported from a different format', () => {
    const candidates = [candidate({ index: 0, localDate: '2026-09-03' })];
    const existing = [existingRow({ id: 'e1', localDate: '2026-09-01', importFormat: 'csv' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'cross-format-window' });
  });

  it('does not use the cross-format window against a row from the same source format', () => {
    const candidates = [candidate({ index: 0, localDate: '2026-09-03' })];
    const existing = [existingRow({ id: 'e1', localDate: '2026-09-01', importFormat: 'ofx' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.has(0)).toBe(false);
  });

  it('does not use the cross-format window against a hand-entered row (null importFormat)', () => {
    const candidates = [candidate({ index: 0, localDate: '2026-09-03' })];
    const existing = [existingRow({ id: 'e1', localDate: '2026-09-01', importFormat: null })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.has(0)).toBe(false);
  });

  it('does not match beyond the cross-format window', () => {
    const candidates = [candidate({ index: 0, localDate: '2026-09-05' })];
    const existing = [existingRow({ id: 'e1', localDate: '2026-09-01', importFormat: 'csv' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.has(0)).toBe(false);
  });

  it('treats a null existing name as an automatic similarity match', () => {
    const candidates = [candidate({ index: 0, name: 'ANYTHING AT ALL' })];
    const existing = [existingRow({ id: 'e1', name: null })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
  });

  it('prefers the exact-date match over a cross-format window match when both are eligible', () => {
    const candidates = [candidate({ index: 0, localDate: '2026-09-01' })];
    const existing = [
      existingRow({ id: 'e-exact', localDate: '2026-09-01', importFormat: 'csv' }),
      existingRow({ id: 'e-window', localDate: '2026-09-02', importFormat: 'csv' }),
    ];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e-exact', by: 'match' });
  });

  it('prefers the exact-date match even when the window candidate is listed first', () => {
    const candidates = [candidate({ index: 0, localDate: '2026-09-01' })];
    const existing = [
      existingRow({ id: 'e-window', localDate: '2026-09-02', importFormat: 'csv' }),
      existingRow({ id: 'e-exact', localDate: '2026-09-01', importFormat: 'csv' }),
    ];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e-exact', by: 'match' });
  });

  it('picks the smaller day gap among two cross-format window candidates', () => {
    const candidates = [candidate({ index: 0, localDate: '2026-09-03' })];
    const existing = [
      existingRow({ id: 'e-far', localDate: '2026-09-01', importFormat: 'csv' }),
      existingRow({ id: 'e-near', localDate: '2026-09-02', importFormat: 'csv' }),
    ];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'ofx' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e-near', by: 'cross-format-window' });
  });

  it('prefers the higher name similarity when two existing rows both match on date and amount', () => {
    const candidates = [candidate({ index: 0, name: 'AAA BBB CCC DDD' })];
    const existing = [
      existingRow({ id: 'e-low', name: 'AAA BBB CCC EEE' }), // Jaccard 3/5 = 0.6, at the threshold
      existingRow({ id: 'e-high', name: 'AAA BBB CCC DDD' }), // exact containment match, similarity 1
    ];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e-high', by: 'match' });
  });

  it('breaks a full tie by the smaller existing id, listed second', () => {
    const candidates = [candidate({ index: 0 })];
    const existing = [existingRow({ id: 'e2' }), existingRow({ id: 'e1' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
  });

  it('breaks a full tie by the smaller existing id, listed first', () => {
    const candidates = [candidate({ index: 0 })];
    const existing = [existingRow({ id: 'e1' }), existingRow({ id: 'e2' })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
  });

  it('never reuses an existing row across two different amount groups', () => {
    const candidates = [candidate({ index: 0, amount: -1250 }), candidate({ index: 1, amount: -500, name: 'OTHER' })];
    const existing = [existingRow({ id: 'e1', amount: -1250 })];
    const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
    expect(matches.get(0)).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
    expect(matches.has(1)).toBe(false);
  });

  it('exposes the threshold and window constants', () => {
    expect(NAME_SIMILARITY_THRESHOLD).toBe(0.6);
    expect(CROSS_FORMAT_WINDOW_DAYS).toBe(2);
  });

  it('property: exactly min(k, m) of k identical file rows are flagged against m similar existing rows, regardless of candidate order, and no existing row is used twice', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.boolean(),
        (k, m, reverseCandidates) => {
          let candidates: DuplicateCandidate[] = Array.from({ length: k }, (_, i) =>
            candidate({ index: i, localDate: '2026-09-01', amount: -1250, name: 'TESCO 123', externalId: null })
          );
          if (reverseCandidates) candidates = [...candidates].reverse().map((c, i) => ({ ...c, index: i }));
          const existing: ExistingRow[] = Array.from({ length: m }, (_, i) =>
            existingRow({ id: `e${i}`, localDate: '2026-09-01', amount: -1250, name: 'Tesco 123' })
          );
          const { matches } = findDuplicates(candidates, existing, { sourceFormat: 'csv' });
          expect(matches.size).toBe(Math.min(k, m));
          const usedIds = new Set([...matches.values()].map((mm) => mm.id));
          expect(usedIds.size).toBe(matches.size);
        }
      ),
      { numRuns: 200 }
    );
  });
});
