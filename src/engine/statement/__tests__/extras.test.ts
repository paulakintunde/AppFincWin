import fc from 'fast-check';
import {
  EXTRA_NEAR_WINDOW_DAYS,
  findExtras,
  statementPeriod,
  type ExtraPoolRow,
  type MissingLine,
} from '../extras';

function row(over: Partial<ExtraPoolRow> & { id: string }): ExtraPoolRow {
  return { localDate: '2026-03-05', amount: -4200, name: 'Shop', status: 'paid', ...over };
}

const PERIOD = { from: '2026-03-01', toInclusive: '2026-03-31' };

describe('statementPeriod', () => {
  it('uses stated start and end', () => {
    expect(statementPeriod({ start: '2026-03-01', end: '2026-03-31' }, [])).toEqual(PERIOD);
  });
  it('start only uses the max row date', () => {
    expect(
      statementPeriod({ start: '2026-03-01', end: null }, ['2026-03-09', null, '2026-03-20'])
    ).toEqual({ from: '2026-03-01', toInclusive: '2026-03-20' });
  });
  it('end only uses the min row date', () => {
    expect(statementPeriod({ start: null, end: '2026-03-31' }, ['2026-03-09', '2026-03-02'])).toEqual({
      from: '2026-03-02',
      toInclusive: '2026-03-31',
    });
  });
  it('neither uses min and max of row dates', () => {
    expect(
      statementPeriod({ start: null, end: null }, ['2026-03-09', null, '2026-03-02', '2026-03-04'])
    ).toEqual({ from: '2026-03-02', toInclusive: '2026-03-09' });
  });
  it('is null with no dates and no bounds', () => {
    expect(statementPeriod({ start: null, end: null }, [null])).toBeNull();
    expect(statementPeriod({ start: '2026-03-01', end: null }, [null])).toBeNull();
    expect(statementPeriod({ start: null, end: '2026-03-01' }, [])).toBeNull();
  });
  it('is null when inverted', () => {
    expect(statementPeriod({ start: '2026-04-01', end: '2026-03-01' }, [])).toBeNull();
  });
});

describe('findExtras', () => {
  it('returns nothing for a null period', () => {
    const r = findExtras([row({ id: 'a' })], new Set(), null, []);
    expect(r.extras).toEqual([]);
    expect(r.nearByIndex.size).toBe(0);
  });

  it('excludes matched ids and out-of-period rows, inclusive bounds', () => {
    const pool = [
      row({ id: 'm' }),
      row({ id: 'in1', localDate: '2026-03-01' }),
      row({ id: 'in2', localDate: '2026-03-31' }),
      row({ id: 'before', localDate: '2026-02-28' }),
      row({ id: 'after', localDate: '2026-04-01' }),
    ];
    const r = findExtras(pool, new Set(['m']), PERIOD, []);
    expect(r.extras.map((e) => e.id)).toEqual(['in1', 'in2']);
  });

  it('never counts pending or skipped rows', () => {
    const pool = [
      row({ id: 'p', status: 'pending' }),
      row({ id: 's', status: 'skipped' }),
      row({ id: 'ok' }),
    ];
    expect(findExtras(pool, new Set(), PERIOD, []).extras.map((e) => e.id)).toEqual(['ok']);
  });

  it('orders by date then id', () => {
    const pool = [
      row({ id: 'b', localDate: '2026-03-05' }),
      row({ id: 'a', localDate: '2026-03-05' }),
      row({ id: 'z', localDate: '2026-03-02' }),
    ];
    expect(findExtras(pool, new Set(), PERIOD, []).extras.map((e) => e.id)).toEqual(['z', 'a', 'b']);
  });

  it('pairs a near-match within the window', () => {
    const missing: MissingLine[] = [{ index: 7, amount: -4200, localDate: '2026-03-03' }];
    const r = findExtras([row({ id: 'x' })], new Set(), PERIOD, missing);
    expect(r.extras[0]?.nearIndex).toBe(7);
    expect(r.nearByIndex.get(7)).toBe('x');
    expect(EXTRA_NEAR_WINDOW_DAYS).toBe(3);
  });

  it('does not pair at 4 days, different amount, or null fields', () => {
    const missing: MissingLine[] = [
      { index: 1, amount: -4200, localDate: '2026-03-09' },
      { index: 2, amount: -100, localDate: '2026-03-05' },
      { index: 3, amount: null, localDate: '2026-03-05' },
      { index: 4, amount: -4200, localDate: null },
    ];
    const r = findExtras([row({ id: 'x' })], new Set(), PERIOD, missing);
    expect(r.extras[0]?.nearIndex).toBeNull();
    expect(r.nearByIndex.size).toBe(0);
  });

  it('pairs each missing line at most once; earlier extra wins', () => {
    const pool = [
      row({ id: 'late', localDate: '2026-03-06' }),
      row({ id: 'early', localDate: '2026-03-04' }),
    ];
    const missing: MissingLine[] = [{ index: 0, amount: -4200, localDate: '2026-03-05' }];
    const r = findExtras(pool, new Set(), PERIOD, missing);
    expect(r.nearByIndex.get(0)).toBe('early');
    expect(r.extras.find((e) => e.id === 'late')?.nearIndex).toBeNull();
  });

  it('prefers smaller gap, then smaller index', () => {
    const missing: MissingLine[] = [
      { index: 5, amount: -4200, localDate: '2026-03-03' },
      { index: 6, amount: -4200, localDate: '2026-03-04' },
      { index: 2, amount: -4200, localDate: '2026-03-04' },
    ];
    const r = findExtras([row({ id: 'x', localDate: '2026-03-05' })], new Set(), PERIOD, missing);
    expect(r.extras[0]?.nearIndex).toBe(2);
  });

  it('prefers the smaller index when it comes later in the list too', () => {
    const missing: MissingLine[] = [
      { index: 2, amount: -4200, localDate: '2026-03-04' },
      { index: 6, amount: -4200, localDate: '2026-03-04' },
    ];
    const r = findExtras([row({ id: 'x', localDate: '2026-03-05' })], new Set(), PERIOD, missing);
    expect(r.extras[0]?.nearIndex).toBe(2);
  });

  it('skips already paired lines for later extras', () => {
    const pool = [
      row({ id: 'a', localDate: '2026-03-05' }),
      row({ id: 'b', localDate: '2026-03-05' }),
    ];
    const missing: MissingLine[] = [
      { index: 0, amount: -4200, localDate: '2026-03-05' },
      { index: 1, amount: -4200, localDate: '2026-03-06' },
    ];
    const r = findExtras(pool, new Set(), PERIOD, missing);
    expect(r.nearByIndex.get(0)).toBe('a');
    expect(r.nearByIndex.get(1)).toBe('b');
  });

  it('handles 5,000 rows in one call', () => {
    const pool: ExtraPoolRow[] = [];
    const missing: MissingLine[] = [];
    for (let i = 0; i < 5000; i++) {
      pool.push(row({ id: `id${i}`, amount: -(i + 1), localDate: '2026-03-10' }));
      missing.push({ index: i, amount: -(i + 1), localDate: '2026-03-11' });
    }
    const r = findExtras(pool, new Set(), PERIOD, missing);
    expect(r.extras).toHaveLength(5000);
    expect(r.nearByIndex.size).toBe(5000);
  });

  it('property: extras are paid, unmatched, in period; near indexes unique', () => {
    const day = fc
      .integer({ min: 1, max: 28 })
      .map((d) => `2026-03-${String(d).padStart(2, '0')}`);
    const poolArb = fc.array(
      fc.record({
        id: fc.uuid(),
        localDate: day,
        amount: fc.integer({ min: -3, max: 3 }),
        name: fc.constant(null),
        status: fc.constantFrom('paid' as const, 'pending' as const, 'skipped' as const),
      }),
      { maxLength: 30 }
    );
    const missArb = fc.array(
      fc.record({
        index: fc.nat(100),
        localDate: fc.option(day, { nil: null }),
        amount: fc.option(fc.integer({ min: -3, max: 3 }), { nil: null }),
      }),
      { maxLength: 30 }
    );
    fc.assert(
      fc.property(poolArb, missArb, fc.nat(30), (pool, missing, k) => {
        const matched = new Set(pool.slice(0, k).map((p) => p.id));
        const period = { from: '2026-03-05', toInclusive: '2026-03-20' };
        const uniq = missing.filter((m, i) => missing.findIndex((o) => o.index === m.index) === i);
        const r = findExtras(pool, matched, period, uniq);
        for (const e of r.extras) {
          const p = pool.find((x) => x.id === e.id);
          expect(p).toBeDefined();
          expect(matched.has(e.id)).toBe(false);
          expect(p?.status).toBe('paid');
          expect(e.localDate >= period.from && e.localDate <= period.toInclusive).toBe(true);
        }
        expect(new Set(r.nearByIndex.keys()).size).toBe(r.nearByIndex.size);
      })
    );
  });
});
