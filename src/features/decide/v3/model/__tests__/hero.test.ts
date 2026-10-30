import type { Evaluation } from '@/engine/decide/v3';
import { answerShownProps, heroHaptic, heroModel } from '../hero';

jest.setTimeout(60000);

type Over = {
  code: string;
  variant?: string | null;
  facts?: { code: string; values: Record<string, number | string | null> }[];
  split?: { source: string; amount: number }[];
  readyBy?: unknown;
  band?: number | null;
  cash?: unknown;
  low?: { left: number; month: string } | null;
  typicalLeft?: number | null;
  monthly?: number;
  running?: number;
};

function ev(o: Over): Evaluation {
  return {
    result: {
      code: o.code,
      variant: o.variant ?? null,
      facts: o.facts ?? [],
      split: o.split ?? [],
      readyBy: o.readyBy ?? null,
      band: o.band === undefined ? 7 : o.band,
    },
    month: { month: '2026-10', monthLeft: 42500, typicalLeft: o.typicalLeft === undefined ? 30000 : o.typicalLeft, low: o.low ?? null },
    purchase: { monthly: o.monthly ?? 0, runningMonthly: o.running ?? 0 },
    cash: o.cash ?? { kind: 'ok' },
  } as unknown as Evaluation;
}

describe('heroModel mapping table', () => {
  it('fits_month: month and left', () => {
    const h = heroModel(ev({ code: 'fits_month' }));
    expect(h.chipKey).toBe('decide.v3.verdict.fitsMonth.chip');
    expect(h.bodyKey).toBe('decide.v3.verdict.fitsMonth.body');
    expect(h.tone).toBe('fits');
    expect(h.params).toEqual({ month: { kind: 'month', ym: '2026-10' }, left: { kind: 'money', minor: 42500 } });
  });

  it('fits_month low_month: from the low_month fact, short = monthly - left', () => {
    const h = heroModel(
      ev({ code: 'fits_month', variant: 'low_month', facts: [{ code: 'low_month', values: { month: '2027-01', left: 5000, monthly: 12000 } }] }),
    );
    expect(h.bodyKey).toBe('decide.v3.verdict.fitsMonthLowMonth.body');
    expect(h.params.lowMonth).toEqual({ kind: 'month', ym: '2027-01' });
    expect(h.params.short).toEqual({ kind: 'money', minor: 7000 });
  });

  it('low_month fact where the tight month still covers it: short 0', () => {
    const h = heroModel(
      ev({ code: 'fits_month', variant: 'low_month', facts: [{ code: 'low_month', values: { month: '2027-01', left: 9000, monthly: 2000 } }] }),
    );
    expect(h.params.short).toEqual({ kind: 'money', minor: 0 });
  });

  it('low_month fact with null values reads as zero', () => {
    const h = heroModel(ev({ code: 'fits_month', variant: 'low_month', facts: [{ code: 'low_month', values: { month: '2027-01', left: null, monthly: null } }] }));
    expect(h.params.short).toEqual({ kind: 'money', minor: 0 });
  });

  it('low_month without the fact falls back to the month model (purchase monthly + running - low left)', () => {
    const h = heroModel(ev({ code: 'fits_month', variant: 'low_month', low: { left: 1000, month: '2026-12' }, monthly: 3000, running: 500 }));
    expect(h.params.lowMonth).toEqual({ kind: 'month', ym: '2026-12' });
    expect(h.params.short).toEqual({ kind: 'money', minor: 2500 });
  });

  it('low_month with no tight month at all degrades to the plain row', () => {
    const h = heroModel(ev({ code: 'fits_month', variant: 'low_month' }));
    expect(h.bodyKey).toBe('decide.v3.verdict.fitsMonth.body');
    expect(h.params.lowMonth).toBeUndefined();
  });

  it('fits_unspent: fromMonth sums month segments, after from the fact', () => {
    const h = heroModel(
      ev({
        code: 'fits_unspent',
        split: [
          { source: 'month', amount: 20000 },
          { source: 'unspent_earlier', amount: 5000 },
          { source: 'month', amount: 1000 },
        ],
        facts: [{ code: 'unspent_before_after', values: { before: 240000, after: 115000 } }],
      }),
    );
    expect(h.bodyKey).toBe('decide.v3.verdict.fitsUnspent.body');
    expect(h.params.fromMonth).toEqual({ kind: 'money', minor: 21000 });
    expect(h.params.after).toEqual({ kind: 'money', minor: 115000 });
  });

  it('fits_unspent low_month adds lowMonth and short', () => {
    const h = heroModel(
      ev({
        code: 'fits_unspent',
        variant: 'low_month',
        facts: [{ code: 'low_month', values: { month: '2027-02', left: 100, monthly: 600 } }],
      }),
    );
    expect(h.bodyKey).toBe('decide.v3.verdict.fitsUnspentLowMonth.body');
    expect(h.params.after).toEqual({ kind: 'money', minor: 0 });
    expect(h.params.short).toEqual({ kind: 'money', minor: 500 });
  });

  it('not_yet payday: short from the cash check, date from readyBy', () => {
    const h = heroModel(
      ev({ code: 'not_yet', variant: 'payday', readyBy: { kind: 'date', date: '2026-11-01' }, cash: { kind: 'payday', until: '2026-11-01', shortBy: 8000 } }),
    );
    expect(h.bodyKey).toBe('decide.v3.verdict.notYetPayday.body');
    expect(h.params).toEqual({ short: { kind: 'money', minor: 8000 }, date: { kind: 'date', iso: '2026-11-01' } });
  });

  it('not_yet payday with readyBy absent takes the date from the cash check', () => {
    const h = heroModel(ev({ code: 'not_yet', variant: 'payday', cash: { kind: 'payday', until: '2026-11-03', shortBy: 100 } }));
    expect(h.params.date).toEqual({ kind: 'date', iso: '2026-11-03' });
  });

  it('not_yet payday with readyBy of the month kind uses the cash check date', () => {
    const h = heroModel(ev({ code: 'not_yet', variant: 'payday', readyBy: { kind: 'month', month: '2026-12' }, cash: { kind: 'payday', until: '2026-11-03', shortBy: 100 } }));
    expect(h.params.date).toEqual({ kind: 'date', iso: '2026-11-03' });
  });

  it('not_yet payday with no date anywhere falls back to the no-date body', () => {
    expect(heroModel(ev({ code: 'not_yet', variant: 'payday', cash: { kind: 'not_covered', shortBy: 1 } })).bodyKey).toBe('decide.v3.ui.answer.notCoveredNoDate');
    expect(heroModel(ev({ code: 'not_yet', variant: 'payday', readyBy: { kind: 'date', date: '2026-11-01' }, cash: { kind: 'ok' } })).bodyKey).toBe(
      'decide.v3.ui.answer.notCoveredNoDate',
    );
  });

  it('not_yet not_covered: readyMonth and whole months from the current month', () => {
    const h = heroModel(ev({ code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2027-03' } }));
    expect(h.bodyKey).toBe('decide.v3.verdict.notYetNotCovered.body');
    expect(h.params).toEqual({ readyMonth: { kind: 'month', ym: '2027-03' }, months: { kind: 'count', n: 5 } });
  });

  it('not_yet not_covered with a date readyBy takes its month', () => {
    const h = heroModel(ev({ code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'date', date: '2026-12-15' } }));
    expect(h.params.readyMonth).toEqual({ kind: 'month', ym: '2026-12' });
    expect(h.params.months).toEqual({ kind: 'count', n: 2 });
  });

  it('not_yet not_covered without readyBy falls back to the no-date body', () => {
    const h = heroModel(ev({ code: 'not_yet', variant: 'not_covered' }));
    expect(h.bodyKey).toBe('decide.v3.ui.answer.notCoveredNoDate');
    expect(h.params).toEqual({});
    expect(h.titleKey).toBe('decide.v3.verdict.notYetNotCovered.title');
  });

  it('not_yet with a null variant reads as not_covered', () => {
    expect(heroModel(ev({ code: 'not_yet' })).chipKey).toBe('decide.v3.verdict.notYetNotCovered.chip');
  });

  it('monthly_short: typical left and the monthly cost', () => {
    const h = heroModel(ev({ code: 'monthly_short', monthly: 9000, running: 1000, typicalLeft: 4000 }));
    expect(h.params).toEqual({ left: { kind: 'money', minor: 4000 }, monthly: { kind: 'money', minor: 10000 } });
    expect(h.tone).toBe('short');
  });

  it('a missing purchase costs 0 a month', () => {
    const e = ev({ code: 'monthly_short' });
    const noPurchase = { ...e, purchase: null } as unknown as Evaluation;
    expect(heroModel(noPurchase).params.monthly).toEqual({ kind: 'money', minor: 0 });
  });

  it('monthly_short with no typical left reads 0', () => {
    expect(heroModel(ev({ code: 'monthly_short', typicalLeft: null })).params.left).toEqual({ kind: 'money', minor: 0 });
  });

  it('emergency_use: used and months from the fact', () => {
    const h = heroModel(ev({ code: 'emergency_use', facts: [{ code: 'emergency_used', values: { used: 36000, months: 6 } }] }));
    expect(h.bodyKey).toBe('decide.v3.verdict.emergencyUse.body');
    expect(h.params).toEqual({ used: { kind: 'money', minor: 36000 }, months: { kind: 'count', n: 6 } });
  });

  it('emergency_use without rebuild months falls back to the no-rebuild body', () => {
    const a = heroModel(ev({ code: 'emergency_use', facts: [{ code: 'emergency_used', values: { used: 36000 } }] }));
    expect(a.bodyKey).toBe('decide.v3.ui.answer.emergencyNoRebuild');
    expect(a.params).toEqual({ used: { kind: 'money', minor: 36000 } });
    const b = heroModel(ev({ code: 'emergency_use', facts: [{ code: 'emergency_used', values: { used: 5, months: null } }] }));
    expect(b.bodyKey).toBe('decide.v3.ui.answer.emergencyNoRebuild');
  });

  it('emergency_use without the fact sums the emergency segment', () => {
    const h = heroModel(ev({ code: 'emergency_use', split: [{ source: 'emergency', amount: 700 }, { source: 'month', amount: 9 }] }));
    expect(h.params.used).toEqual({ kind: 'money', minor: 700 });
    expect(h.bodyKey).toBe('decide.v3.ui.answer.emergencyNoRebuild');
  });

  it('needs_input has no params', () => {
    const h = heroModel(ev({ code: 'needs_input' }));
    expect(h.params).toEqual({});
    expect(h.tone).toBe('input');
  });
});

describe('heroHaptic', () => {
  it('warns once when a warning answer first appears or its code changes', () => {
    expect(heroHaptic(undefined, 'not_yet')).toBe('warning');
    expect(heroHaptic('not_yet', 'not_yet')).toBeNull();
    expect(heroHaptic('fits_month', 'monthly_short')).toBe('warning');
    expect(heroHaptic('fits_month', 'emergency_use')).toBe('warning');
  });
  it('never for fits or needs_input', () => {
    expect(heroHaptic('needs_input', 'fits_month')).toBeNull();
    expect(heroHaptic(undefined, 'fits_unspent')).toBeNull();
    expect(heroHaptic('not_yet', 'needs_input')).toBeNull();
  });
});

describe('answerShownProps', () => {
  it('is code, variant and band only', () => {
    const p = answerShownProps(ev({ code: 'not_yet', variant: 'payday', band: 4 }));
    expect(p).toEqual({ code: 'not_yet', variant: 'payday', band: 4 });
  });
  it('defaults variant to none and band to 1', () => {
    expect(answerShownProps(ev({ code: 'fits_month', band: null }))).toEqual({ code: 'fits_month', variant: 'none', band: 1 });
  });
});
