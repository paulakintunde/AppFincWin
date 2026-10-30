import { everyOf, recordLines } from '../recordLines';

const sched = (o: { count?: number; payment?: number; unit?: 'week' | 'month'; every?: number; financed?: number } = {}) => ({
  cadence: { unit: o.unit ?? 'month', every: o.every ?? 1 },
  count: o.count ?? 60,
  payment: o.payment ?? 53_336,
  financed: o.financed ?? 3_000_000,
});
const purchase = (o: { dayOne?: number; financed?: boolean; schedule?: ReturnType<typeof sched> | null } = {}) =>
  ({ dayOne: o.dayOne ?? 120_000, financed: o.financed ?? false, schedule: o.schedule ?? null }) as never;
const facts = (after?: number) =>
  ({ facts: after === undefined ? [] : [{ code: 'unspent_before_after', values: { before: 9, after } }] }) as never;

describe('recordLines', () => {
  it('a one-off purchase is the item line and the unspent line', () => {
    expect(recordLines({ purchase: purchase(), result: facts(500_000), item: 'Sofa', month: '2026-10', done: false })).toEqual([
      { key: 'lineItem', params: { item: 'Sofa', amount: 120_000, month: '2026-10' } },
      { key: 'lineUnspent', params: { after: 500_000 } },
    ]);
  });

  it('leaves the unspent line out when the fact is absent, and a non-number after', () => {
    expect(recordLines({ purchase: purchase(), result: facts(), item: 'Sofa', month: '2026-10', done: false })).toHaveLength(1);
    const odd = { facts: [{ code: 'unspent_before_after', values: { after: null } }] } as never;
    expect(recordLines({ purchase: purchase(), result: odd, item: 'Sofa', month: '2026-10', done: false })).toHaveLength(1);
  });

  it('the done variant uses the past-tense unspent line', () => {
    const lines = recordLines({ purchase: purchase(), result: facts(1), item: 'Sofa', month: '2026-10', done: true });
    expect(lines[1]).toEqual({ key: 'lineUnspentDone', params: { after: 1 } });
  });

  it('a payment plan shows the plan and the deposit', () => {
    const p = purchase({ dayOne: 500_000, financed: true, schedule: sched() });
    expect(recordLines({ purchase: p, result: facts(), item: 'Car', month: '2026-10', done: false })).toEqual([
      { key: 'linePlan', params: { count: 60, payment: 53_336, every: 'everyMonth' } },
      { key: 'lineDeposit', params: { amount: 500_000 } },
    ]);
  });

  it('a plan with no deposit has no deposit line; weekly reads every week', () => {
    const p = purchase({ dayOne: 0, financed: true, schedule: sched({ unit: 'week' }) });
    const lines = recordLines({ purchase: p, result: facts(), item: 'Car', month: '2026-10', done: false });
    expect(lines).toEqual([{ key: 'linePlan', params: { count: 60, payment: 53_336, every: 'everyWeek' } }]);
  });

  it('a financed purchase with nothing financed reads as a one-off', () => {
    const p = purchase({ financed: true, schedule: sched({ financed: 0 }) });
    expect(recordLines({ purchase: p, result: facts(), item: 'Tv', month: '2026-10', done: false })[0]?.key).toBe('lineItem');
  });

  it('everyOf covers each cadence', () => {
    expect(everyOf({ unit: 'week', every: 1 })).toBe('everyWeek');
    expect(everyOf({ unit: 'week', every: 2 })).toBe('everyTwoWeeks');
    expect(everyOf({ unit: 'week', every: 3 })).toBe('everyMonth');
    expect(everyOf({ unit: 'month', every: 1 })).toBe('everyMonth');
  });
});
