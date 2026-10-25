import type { FxLatestRow } from '@/db/rows';
import { convertLatest } from '@/data/queries/fxConvert';
import { emptyCheckInputs } from '../checkInputs';
import { fromHomePatch, inHomeCurrency, sourceFor, typedCurrency } from '../checkCurrency';
import { computeChip, computeCore } from '../computeCheck';
import type { CheckInputs, SnapshotResult } from '../types';
import { TODAY, loggedSource } from './helpers/snapshotFixtures';

const RATES: FxLatestRow[] = [
  { quote: 'USD', rate: '1.0800000000', rate_date: '2026-10-14', source: 'frankfurter-v2' },
  { quote: 'GBP', rate: '0.8600000000', rate_date: '2026-10-12', source: 'frankfurter-v2' },
];
const usd = (): SnapshotResult => ({ ...loggedSource(), fx: { rates: RATES, customs: [], today: TODAY } });
const gbpToUsd = (n: number): number => convertLatest(n, 'GBP', 'USD', RATES, [], TODAY)!.amount;
const usdToGbp = (n: number): number => convertLatest(n, 'USD', 'GBP', RATES, [], TODAY)!.amount;

/** A GBP check with every money field filled. */
function typedGbp(over: Partial<CheckInputs> = {}): CheckInputs {
  const e = emptyCheckInputs('buy', TODAY);
  return {
    ...e,
    currency: 'GBP',
    advertised: 120_000,
    method: 'cash',
    adjustments: [{ id: 'a1', name: 'Fee', amount: 1_000, note: '', counted: true, effect: 'adds', onDay: true, taxPercentText: null }],
    runningCosts: [{ id: 'r1', name: 'Ins', amount: 2_000, note: '', counted: true, seriesId: null, category: null }],
    replaces: [{ id: 'p1', name: 'Old', amount: 500, note: '', counted: true, seriesId: null, category: null }],
    setbacks: [
      { id: 's1', code: 'unexpected_expense', enabled: true, amount: 30_000, percentDrop: 0, months: 0, daysLate: 0 },
      { id: 's2', code: 'job_loss', enabled: true, amount: null, percentDrop: 0, months: 3, daysLate: 0 },
    ],
    lossOfValue: { kind: 'amount', monthly: 4_000 },
    loan: { ...e.loan, deposit: 10_000 },
    instalment: { amount: 5_000, count: 12, lateFee: null },
    card: { ...e.card, fees: 300 },
    incomeChange: { direction: 'raises', amount: 50_000, startDate: '2027-01-01', likelihood: 'likely' },
    wait: { monthlyAmount: 20_000 },
    split: { kind: 'amount', weights: [], amounts: [100, 200] },
    ...over,
  };
}

describe('D-67 checks typed in another currency (CR-B02, CR-C06)', () => {
  it('typedCurrency is the stamp, USD for an unstamped sample, else home', () => {
    expect(typedCurrency(typedGbp(), 'USD', false)).toBe('GBP');
    expect(typedCurrency(typedGbp({ currency: null }), 'CAD', true)).toBe('USD');
    expect(typedCurrency(typedGbp({ currency: null }), 'CAD', false)).toBe('CAD');
  });

  it('a check in the home currency is unchanged', () => {
    const inputs = typedGbp({ currency: 'USD' });
    expect(inHomeCurrency(inputs, usd(), { isSample: false })).toEqual({ kind: 'home', inputs });
  });

  it('converts every amount at the latest stored rate and keeps the typed stamp out of the view', () => {
    const view = inHomeCurrency(typedGbp(), usd(), { isSample: false });
    if (view.kind !== 'converted') throw new Error(view.kind);
    expect(view.note).toEqual({ from: 'GBP', to: 'USD' });
    const v = view.inputs;
    expect(v.currency).toBe('USD');
    expect(v.advertised).toBe(gbpToUsd(120_000));
    expect(v.adjustments[0]!.amount).toBe(gbpToUsd(1_000));
    expect(v.runningCosts[0]!.amount).toBe(gbpToUsd(2_000));
    expect(v.replaces[0]!.amount).toBe(gbpToUsd(500));
    expect(v.setbacks.map((s) => s.amount)).toEqual([gbpToUsd(30_000), null]);
    expect(v.lossOfValue).toEqual({ kind: 'amount', monthly: gbpToUsd(4_000) });
    expect(v.loan.deposit).toBe(gbpToUsd(10_000));
    expect(v.instalment).toEqual({ amount: gbpToUsd(5_000), count: 12, lateFee: null });
    expect(v.card.fees).toBe(gbpToUsd(300));
    expect(v.incomeChange?.amount).toBe(gbpToUsd(50_000));
    expect(v.wait.monthlyAmount).toBe(gbpToUsd(20_000));
    expect(v.split?.amounts).toEqual([gbpToUsd(100), gbpToUsd(200)]);
  });

  it('empty optional amounts stay empty', () => {
    const view = inHomeCurrency(
      typedGbp({ advertised: null, lossOfValue: { kind: 'percent_per_year', percentText: '10' }, card: { ...typedGbp().card, fees: null }, incomeChange: null, wait: { monthlyAmount: null }, split: null, instalment: { amount: null, count: null, lateFee: 200 } }),
      usd(),
      { isSample: false }
    );
    if (view.kind !== 'converted') throw new Error(view.kind);
    expect(view.inputs.advertised).toBeNull();
    expect(view.inputs.lossOfValue).toEqual({ kind: 'percent_per_year', percentText: '10' });
    expect(view.inputs.incomeChange).toBeNull();
    expect(view.inputs.split).toBeNull();
    expect(view.inputs.instalment.lateFee).toBe(gbpToUsd(200));
    expect(inHomeCurrency(typedGbp({ lossOfValue: null }), usd(), { isSample: false }).inputs.lossOfValue).toBeNull();
  });

  it('IN-A01: an unstamped sample check converts from USD', () => {
    const cad: SnapshotResult = { ...usd(), currency: 'CAD' as never, fx: { rates: [...RATES, { quote: 'CAD', rate: '1.5000000000', rate_date: '2026-10-14', source: 'frankfurter-v2' }], customs: [], today: TODAY } };
    const view = inHomeCurrency(typedGbp({ currency: null }), cad, { isSample: true });
    expect(view.kind).toBe('converted');
    expect(view.kind === 'converted' && view.note).toEqual({ from: 'USD', to: 'CAD' });
  });

  it('a missing rate (or no stored rates at all) reads unconverted and is never judged', () => {
    const jpy = inHomeCurrency(typedGbp({ currency: 'JPY' }), usd(), { isSample: false });
    expect(jpy).toEqual({ kind: 'missing', inputs: typedGbp({ currency: 'JPY' }), unconverted: { currencies: ['JPY'], rowCount: 1 } });
    expect(inHomeCurrency(typedGbp(), loggedSource(), { isSample: false }).kind).toBe('missing');
    const source = sourceFor(usd(), jpy);
    expect(source.unconverted).toEqual({ currencies: ['JPY'], rowCount: 1 });
    expect(computeCore(source, jpy.inputs).status).toBe('unconverted');
    expect(computeChip(source, jpy.inputs).status).toBe('unconverted');
  });

  it('sourceFor keeps the snapshot for a home or converted check, and an existing unconverted note', () => {
    const s = usd();
    expect(sourceFor(s, inHomeCurrency(typedGbp(), s, { isSample: false }))).toBe(s);
    const already: SnapshotResult = { ...s, unconverted: { currencies: ['EUR'], rowCount: 2 } };
    expect(sourceFor(already, inHomeCurrency(typedGbp({ currency: 'JPY' }), s, { isSample: false }))).toBe(already);
  });

  it('a £1,200 check is judged as about $1,507, not $1,200', () => {
    const s = usd();
    const view = inHomeCurrency(typedGbp({ adjustments: [], runningCosts: [], replaces: [], lossOfValue: null }), s, { isSample: false });
    const core = computeCore(sourceFor(s, view), view.inputs);
    expect(core.resolvedPrice?.price).toBe(gbpToUsd(120_000));
    expect(core.resolvedPrice?.price).not.toBe(120_000);
  });

  describe('fromHomePatch', () => {
    const s = usd();
    const stored = typedGbp();
    const view = inHomeCurrency(stored, s, { isSample: false }).inputs;

    it('converts an edited amount back into the typed currency', () => {
      expect(fromHomePatch({ advertised: 150_000 }, stored, s, { isSample: false })).toEqual({ advertised: usdToGbp(150_000) });
    });

    it('an amount the edit did not change keeps its exact stored value', () => {
      const patch = fromHomePatch({ adjustments: view.adjustments, runningCosts: [...view.runningCosts, { ...view.runningCosts[0]!, id: 'r2', amount: 1_000 }], name: 'x' }, stored, s, { isSample: false });
      expect(patch.adjustments).toEqual(stored.adjustments);
      expect(patch.runningCosts!.map((l) => l.amount)).toEqual([2_000, usdToGbp(1_000)]);
      expect(patch.name).toBe('x');
      const all = fromHomePatch({ ...view }, stored, s, { isSample: false });
      for (const key of ['advertised', 'replaces', 'setbacks', 'lossOfValue', 'loan', 'instalment', 'card', 'incomeChange', 'wait', 'split'] as const) {
        expect(all[key]).toEqual(stored[key]);
      }
    });

    it('never saves the stamp, and passes a home-currency or unconvertible check through', () => {
      expect(fromHomePatch({ currency: 'USD', advertised: 5 }, stored, s, { isSample: false })).toEqual({ advertised: usdToGbp(5) });
      expect(fromHomePatch({ currency: 'EUR', advertised: 5 }, typedGbp({ currency: 'USD' }), s, { isSample: false })).toEqual({ advertised: 5 });
      expect(fromHomePatch({ advertised: 5 }, typedGbp({ currency: 'JPY' }), s, { isSample: false })).toEqual({ advertised: 5 });
      expect(fromHomePatch({ advertised: 5 }, stored, loggedSource(), { isSample: false })).toEqual({ advertised: 5 });
    });

    it('an amount too large to convert back is left as typed', () => {
      // GBP→USD multiplies, so a huge USD figure converts back to GBP; the reverse (USD typed, GBP home) overflows
      const gbp: SnapshotResult = { ...s, currency: 'GBP' as never };
      expect(fromHomePatch({ advertised: Number.MAX_SAFE_INTEGER }, typedGbp({ currency: 'USD' }), gbp, { isSample: false })).toEqual({ advertised: Number.MAX_SAFE_INTEGER });
    });
  });
});
