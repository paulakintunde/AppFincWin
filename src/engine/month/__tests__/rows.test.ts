/**
 * 05.5-26: the usual month as rows. The rows always add up to the month model's own "left", and the typed-estimates month reads the
 * typed figures.
 */
import { minorUnits } from '../../money/types';
import { prepare } from '../../decide/v3/prepare';
import type { V3Inputs } from '../../decide/v3/types';
import { inputsOf, monthOf, v3Line, v3Series } from '../../decide/v3/__tests__/helpers/fixtures';
import { monthPicture } from '../picture';
import { monthRows, standingPlans } from '../rows';

const mu = minorUnits;
const MONTHLY = { unit: 'month', every: 1 } as const;

function sam(over: Partial<V3Inputs> = {}): V3Inputs {
  const months = ['2026-07', '2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `r-${m}`, date: `${m}-10`, amount: 120_000, role: 'spending', seriesId: 'rent' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: 100_000 }),
    ])
  );
  return inputsOf({
    months: [...months, monthOf('2026-10', [], { full: false })],
    series: [
      v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 300_000 }),
      v3Series({ id: 'rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-10', amount: 120_000 }),
      v3Series({ id: 'save', role: 'saving', cadence: MONTHLY, anchorDate: '2026-01-05', amount: 20_000, savingMode: 'fixed' }),
      v3Series({ id: 'flex', role: 'saving', cadence: MONTHLY, anchorDate: '2026-01-06', amount: 7_000, savingMode: 'flexible' }),
      v3Series({ id: 'inv', role: 'investing', cadence: MONTHLY, anchorDate: '2026-01-07', amount: 5_000, savingMode: 'fixed' }),
    ],
    debts: [{ id: 'loan', kind: 'loan', balance: mu(500_000), minimum: mu(10_000), apr: null, secured: false, isHousing: false, dueDay: 15 }],
    ...over,
  });
}

describe('monthRows', () => {
  it('reads a logged month and the rows add up to the usual month left', () => {
    const p = prepare(sam());
    const r = monthRows(p);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.source).toBe('logged');
    expect(r.income).toBe(300_000);
    expect(r.debts).toBe(10_000);
    expect(r.saving).toBe(25_000); // fixed saving 20,000 + investing 5,000; the flexible plan is left out
    expect(r.setAside).toBe(0);
    expect(r.result).toBe(monthPicture(p).usual?.left);
    expect(r.income - r.spending - r.debts - r.saving - r.setAside).toBe(r.result);
  });

  it('counts a debt paid through a bill once: its minimum is in debts, out of spending', () => {
    const inputs = sam({
      series: [...sam().series, v3Series({ id: 'loan-bill', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-15', amount: 10_000 })],
      debts: [{ id: 'loan', kind: 'loan', balance: mu(500_000), minimum: mu(10_000), apr: null, secured: false, isHousing: false, dueDay: 15, seriesId: 'loan-bill' }],
    });
    const r = monthRows(prepare(inputs));
    expect(r?.debts).toBe(10_000);
    expect(r !== null && r.income - r.spending - r.debts - r.saving - r.setAside).toBe(r?.result);
  });

  it('puts a pot into the set-aside row', () => {
    const inputs = sam({
      envelopes: [{ id: 'pot', kind: 'pot', target: mu(120_000), monthlyAmount: mu(30_000), readyBy: null, saved: mu(0), purposeId: null, planMonthly: mu(30_000) }],
    });
    const r = monthRows(prepare(inputs));
    expect(r !== null && r.setAside > 0).toBe(true);
    expect(r !== null && r.income - r.spending - r.debts - r.saving - r.setAside).toBe(r?.result);
  });

  it('reads the typed figures when there are no logged months', () => {
    const inputs = inputsOf({
      months: [],
      series: [],
      debts: [],
      typedEstimates: { income: mu(400_000), expenses: mu(300_000), saving: mu(10_000), debt: mu(20_000), invest: mu(5_000), asOf: '2026-10-03' },
    });
    const r = monthRows(prepare(inputs));
    expect(r?.source).toBe('typed');
    expect(r?.income).toBe(400_000);
    expect(r?.debts).toBe(20_000);
    expect(r?.saving).toBe(15_000);
    expect(r?.setAside).toBe(0);
    expect(r !== null && r.income - r.spending - r.debts - r.saving - r.setAside).toBe(r?.result);
  });

  it('gives null when there is no usual month to show', () => {
    expect(monthRows(prepare(inputsOf({ months: [], series: [], debts: [] })))).toBeNull();
  });
});

describe('standingPlans', () => {
  it('sums the live saving and investing plans, flexible ones included', () => {
    const p = standingPlans({ inputs: sam() });
    expect(p.saving).toBe(27_000);
    expect(p.investing).toBe(5_000);
  });
});
