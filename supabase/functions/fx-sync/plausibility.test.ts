import { classifyRates, PLAUSIBILITY_THRESHOLD, CONFIRM_TOLERANCE, type StoredRate, type OpenHold } from './plausibility';
import type { FxRow } from './parse';

describe('classifyRates', () => {
  it('exposes the D-11/D-12 threshold constants', () => {
    expect(PLAUSIBILITY_THRESHOLD).toBe(0.1);
    expect(CONFIRM_TOLERANCE).toBe(0.03);
  });

  it('accepts a quote with no prior history', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '1.15', date: '2026-09-24' }];
    const result = classifyRates(incoming, [], [], 'frankfurter-v2');
    expect(result).toEqual({ accept: incoming, hold: [], confirm: [], skipped: [] });
  });

  it('accepts a move within 10%', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '108', date: '2026-09-24' }];
    const history: StoredRate[] = [{ quote: 'USD', rate: '100', date: '2026-09-23' }];
    const result = classifyRates(incoming, history, [], 'frankfurter-v2');
    expect(result.accept).toEqual(incoming);
    expect(result.hold).toEqual([]);
  });

  it('accepts a move at exactly 10%', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '110', date: '2026-09-24' }];
    const history: StoredRate[] = [{ quote: 'USD', rate: '100', date: '2026-09-23' }];
    const result = classifyRates(incoming, history, [], 'frankfurter-v2');
    expect(result.accept).toEqual(incoming);
    expect(result.hold).toEqual([]);
  });

  it('holds a move just past 10%, carrying the prior rate/date and the ratio', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '110.01', date: '2026-09-24' }];
    const history: StoredRate[] = [{ quote: 'USD', rate: '100', date: '2026-09-23' }];
    const result = classifyRates(incoming, history, [], 'frankfurter-v2');
    expect(result.accept).toEqual([]);
    expect(result.hold).toHaveLength(1);
    expect(result.hold[0]).toMatchObject({
      base: 'EUR',
      quote: 'USD',
      rate: '110.01',
      priorRate: '100',
      priorDate: '2026-09-23',
      source: 'frankfurter-v2',
    });
    expect(result.hold[0].changeRatio).toBeCloseTo(0.1001, 6);
  });

  it('picks the latest history row strictly before the incoming date, not just the last array entry (Pitfall 4)', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '104', date: '2026-09-24' }];
    const history: StoredRate[] = [
      { quote: 'USD', rate: '90', date: '2026-09-18' },
      { quote: 'USD', rate: '100', date: '2026-09-21' },
    ];
    const result = classifyRates(incoming, history, [], 'frankfurter-v2');
    // 104 vs the later prior (100, 4%) accepts; against the earlier one (90, 15.5%) it would hold.
    expect(result.hold).toEqual([]);
    expect(result.accept).toEqual(incoming);
  });

  it('accepts an incoming row identical to an already-stored row for the same date, regardless of a large prior-day move (idempotent upsert)', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '150', date: '2026-09-24' }];
    const history: StoredRate[] = [
      { quote: 'USD', rate: '100', date: '2026-09-23' },
      { quote: 'USD', rate: '150', date: '2026-09-24' },
    ];
    const result = classifyRates(incoming, history, [], 'frankfurter-v2');
    expect(result.accept).toEqual(incoming);
    expect(result.hold).toEqual([]);
  });

  it('confirms an open hold when a witness from a different source lands within 3% of the held rate', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '1.30', date: '2026-09-24' }];
    const openHolds: OpenHold[] = [{ id: 7, quote: 'USD', heldRate: '1.32', heldDate: '2026-09-24', source: 'frankfurter-v2' }];
    const result = classifyRates(incoming, [], openHolds, 'open-er-api');
    expect(result.confirm).toEqual([
      { holdId: 7, row: { base: 'EUR', quote: 'USD', rate: '1.32', date: '2026-09-24' }, source: 'frankfurter-v2' },
    ]);
    expect(result.accept).toEqual(incoming);
    expect(result.hold).toEqual([]);
  });

  it('confirms an open hold when a later refresh from the same source lands within 3% (D-12 "or a later refresh")', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '1.33', date: '2026-09-25' }];
    const openHolds: OpenHold[] = [{ id: 7, quote: 'USD', heldRate: '1.32', heldDate: '2026-09-24', source: 'frankfurter-v2' }];
    const result = classifyRates(incoming, [], openHolds, 'frankfurter-v2');
    expect(result.confirm).toEqual([
      { holdId: 7, row: { base: 'EUR', quote: 'USD', rate: '1.32', date: '2026-09-24' }, source: 'frankfurter-v2' },
    ]);
    expect(result.accept).toEqual(incoming);
  });

  it('holds again when the witness is beyond 3% of the held rate', () => {
    const incoming: FxRow[] = [{ base: 'EUR', quote: 'USD', rate: '1.50', date: '2026-09-24' }];
    const openHolds: OpenHold[] = [{ id: 7, quote: 'USD', heldRate: '1.32', heldDate: '2026-09-24', source: 'frankfurter-v2' }];
    const history: StoredRate[] = [{ quote: 'USD', rate: '1.15', date: '2026-09-23' }];
    const result = classifyRates(incoming, history, openHolds, 'open-er-api');
    expect(result.confirm).toEqual([]);
    expect(result.hold).toHaveLength(1);
    expect(result.hold[0]).toMatchObject({
      quote: 'USD',
      rate: '1.50',
      priorRate: '1.15',
      priorDate: '2026-09-23',
      source: 'open-er-api',
    });
  });

  describe('dropped and already-held tuples are terminal (CR-B02)', () => {
    const history: StoredRate[] = [{ quote: 'JPY', rate: '160', date: '2026-09-24' }];

    it('skips an incoming row whose (quote, date, source) was dropped by the operator -- never re-held, never accepted', () => {
      const incoming: FxRow[] = [{ base: 'EUR', quote: 'JPY', rate: '200', date: '2026-09-25' }];
      const holds: OpenHold[] = [
        { id: 3, quote: 'JPY', heldRate: '200', heldDate: '2026-09-25', source: 'frankfurter-v2', status: 'dropped' },
      ];
      const result = classifyRates(incoming, history, holds, 'frankfurter-v2');
      expect(result).toEqual({ accept: [], hold: [], confirm: [], skipped: incoming });
    });

    it('skips an incoming row that re-reports an already-held (quote, date, source), so no duplicate hold or alert', () => {
      const incoming: FxRow[] = [{ base: 'EUR', quote: 'JPY', rate: '200', date: '2026-09-25' }];
      const holds: OpenHold[] = [
        { id: 3, quote: 'JPY', heldRate: '200', heldDate: '2026-09-25', source: 'frankfurter-v2', status: 'held' },
      ];
      const result = classifyRates(incoming, history, holds, 'frankfurter-v2');
      expect(result).toEqual({ accept: [], hold: [], confirm: [], skipped: incoming });
    });

    it('never confirms a dropped hold, even when a different-source witness agrees with it', () => {
      const incoming: FxRow[] = [{ base: 'EUR', quote: 'JPY', rate: '199', date: '2026-09-25' }];
      const holds: OpenHold[] = [
        { id: 3, quote: 'JPY', heldRate: '200', heldDate: '2026-09-25', source: 'frankfurter-v2', status: 'dropped' },
      ];
      const result = classifyRates(incoming, history, holds, 'open-er-api');
      expect(result.confirm).toEqual([]);
      // The open.er-api witness is judged on its own merits: 199 vs 160 is a >10% move.
      expect(result.hold).toHaveLength(1);
      expect(result.hold[0]).toMatchObject({ quote: 'JPY', source: 'open-er-api' });
    });
  });
});
