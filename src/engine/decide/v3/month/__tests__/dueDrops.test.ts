import { minorUnits as mu } from '../../../../money/types';
import type { ReadinessWaiver, SkippedOccurrence, V3Series } from '../../types';
import { dueDrops } from '../dueDrops';

function ser(over: Partial<V3Series> & { id: string }): V3Series {
  return {
    role: 'bill',
    cadence: { unit: 'month', every: 1 },
    anchorDate: '2026-01-01',
    endDate: null,
    amount: mu(90000),
    status: 'live',
    confirmed: true,
    payGroup: null,
    countsAs: null,
    incomeKind: null,
    typicalChoice: null,
    categoryId: null,
    isHousing: false,
    savingMode: null,
    ...over,
  };
}

const rent = ser({ id: 'rent', name: 'Rent' });
const netflix = ser({ id: 'netflix', name: 'Netflix', amount: mu(1199), anchorDate: '2026-01-03' });
const lunch = ser({ id: 'lunch', name: 'Lunch', amount: mu(1000), cadence: { unit: 'week', every: 2 }, anchorDate: '2026-10-05' });
const series = [rent, netflix, lunch];

function drops(waivers?: readonly ReadinessWaiver[], skipped?: readonly SkippedOccurrence[], asOf = '2026-10-30') {
  return dueDrops({ asOf, series, waivers, skipped });
}

describe('dueDrops (D-27, D-31)', () => {
  it('drops nothing when there are no waivers and no skips', () => {
    for (const d of [drops(), drops([], [])]) {
      expect(d.alwaysOther.size).toBe(0);
      expect(d.keys.size).toBe(0);
      expect(d.has('rent', '2026-10-01')).toBeNull();
      expect(d.has('lunch', '2026-10-05')).toBeNull();
    }
  });

  it('paid_by_other drops that one occurrence only', () => {
    const d = drops([{ kind: 'paid_by_other', seriesId: 'rent', date: '2026-10-01' }]);
    expect(d.has('rent', '2026-10-01')).toBe('paid_by_other');
    expect(d.has('rent', '2026-11-01')).toBeNull();
    expect(d.has('rent', '2026-09-01')).toBeNull();
    expect(d.keys.get('rent|2026-10-01')).toBe('paid_by_other');
  });

  it('always_other drops every occurrence of the series, in any month', () => {
    const d = drops([{ kind: 'always_other', seriesId: 'lunch' }]);
    expect([...d.alwaysOther]).toEqual(['lunch']);
    for (const date of ['2026-10-05', '2026-10-19', '2026-03-09', '2027-01-11']) expect(d.has('lunch', date)).toBe('always_other');
    expect(d.has('rent', '2026-10-01')).toBeNull();
  });

  it('a skip settles the nearest occurrence within the match window', () => {
    expect(drops(undefined, [{ seriesId: 'netflix', date: '2026-10-04' }]).has('netflix', '2026-10-03')).toBe('skipped');
    expect(drops(undefined, [{ seriesId: 'netflix', date: '2026-10-03' }]).has('netflix', '2026-10-03')).toBe('skipped');
    expect(drops(undefined, [{ seriesId: 'netflix', date: '2026-09-30' }]).has('netflix', '2026-10-03')).toBe('skipped');
    const d = drops(undefined, [{ seriesId: 'netflix', date: '2026-10-04' }]);
    expect(d.has('netflix', '2026-11-03')).toBeNull();
    expect(d.keys.get('netflix|2026-10-03')).toBe('skipped');
  });

  it('a skip outside the window, or for an unknown or unconfirmed series, is ignored', () => {
    expect(drops(undefined, [{ seriesId: 'netflix', date: '2026-10-10' }]).keys.size).toBe(0);
    expect(drops(undefined, [{ seriesId: 'ghost', date: '2026-10-03' }]).keys.size).toBe(0);
    const d = dueDrops({
      asOf: '2026-10-30',
      series: [ser({ id: 'maybe', confirmed: false, anchorDate: '2026-01-03' })],
      skipped: [{ seriesId: 'maybe', date: '2026-10-03' }],
    });
    expect(d.keys.size).toBe(0);
  });

  it('a future-dated waiver gives null', () => {
    const d = drops([{ kind: 'paid_by_other', seriesId: 'rent', date: '2026-11-01' }]);
    expect(d.has('rent', '2026-11-01')).toBeNull();
    expect(d.keys.size).toBe(0);
  });

  it('readiness-only waivers change nothing', () => {
    const d = drops([
      { kind: 'didnt_happen', seriesId: 'rent', date: '2026-10-01' },
      { kind: 'no_pay', seriesId: 'rent', date: '2026-10-01' },
      { kind: 'income_elsewhere' },
      { kind: 'nothing_to_add', month: '2026-10', at: '2026-10-20' },
      { kind: 'month_complete', month: '2026-09', at: '2026-10-02' },
      { kind: 'start_from', month: '2026-09' },
    ]);
    expect(d.has('rent', '2026-10-01')).toBeNull();
    expect(d.keys.size).toBe(0);
    expect(d.alwaysOther.size).toBe(0);
  });

  it('paid_by_other wins over always_other, which wins over skipped', () => {
    const both = drops(
      [
        { kind: 'always_other', seriesId: 'netflix' },
        { kind: 'paid_by_other', seriesId: 'netflix', date: '2026-10-03' },
      ],
      [{ seriesId: 'netflix', date: '2026-10-03' }],
    );
    expect(both.has('netflix', '2026-10-03')).toBe('paid_by_other');
    expect(both.keys.get('netflix|2026-10-03')).toBe('paid_by_other');

    const skipThenPbo = drops(
      [{ kind: 'paid_by_other', seriesId: 'netflix', date: '2026-10-03' }],
      [{ seriesId: 'netflix', date: '2026-10-03' }],
    );
    expect(skipThenPbo.keys.get('netflix|2026-10-03')).toBe('paid_by_other');

    const alwaysAndSkip = drops([{ kind: 'always_other', seriesId: 'netflix' }], [{ seriesId: 'netflix', date: '2026-10-03' }]);
    expect(alwaysAndSkip.has('netflix', '2026-10-03')).toBe('always_other');
  });

  it('does not depend on the order of waivers and skips', () => {
    const w: ReadinessWaiver[] = [
      { kind: 'paid_by_other', seriesId: 'netflix', date: '2026-10-03' },
      { kind: 'always_other', seriesId: 'lunch' },
      { kind: 'always_other', seriesId: 'rent' },
    ];
    const s: SkippedOccurrence[] = [
      { seriesId: 'netflix', date: '2026-10-02' },
      { seriesId: 'netflix', date: '2026-09-03' },
    ];
    const a = drops(w, s);
    const b = drops([...w].reverse(), [...s].reverse());
    expect([...a.keys].sort()).toEqual([...b.keys].sort());
    expect([...a.alwaysOther].sort()).toEqual([...b.alwaysOther].sort());
    expect(a.keys.get('netflix|2026-09-03')).toBe('skipped');
  });
});
