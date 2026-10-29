import type { FxLatestRow } from '@/db/rows';
import { readStoredCheck, seenOf, toStoredV2, type AccountUse } from '@/engine/decide/v3';
import { carInputs, demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import { emptyCheckInputs } from '../../checkInputs';
import * as snapshotModule from '../../buildSnapshot';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { computeV3, computeV3WithoutRefunds, reanswerSaved, resultForCheck, resultForHome, resultForSavedPlan } from '../computeV3';
import { v3s } from './v3Fixtures';

const TODAY = '2026-10-03';
const source = (): SnapshotSource => demoSource(TODAY);
type Row = SnapshotSource['rows'][number];
const row = (id: string, account: string, amount: number, over: Partial<Row> = {}): Row => ({
  id, account_id: account, local_date: '2026-10-02', original_amount: amount, original_currency: 'USD', home_currency: 'USD', home_amount: amount,
  orig_per_eur: null, status: 'paid', is_refund: false, transfer_id: null, recurring_series_id: null, category_id: null, deleted_at: null, ...over,
});

describe('computeV3 (S9: one Result)', () => {
  it.each([
    ['sofa', sofaInputs],
    ['car', carInputs],
  ])('the %s check gives a deep-equal Result from Home, the check screen and a saved plan', (_name, inputs) => {
    const one = computeV3(source(), null, inputs).result;
    expect(resultForHome(source(), null, inputs)).toEqual(one);
    expect(resultForCheck(source(), null, inputs)).toEqual(one);
    expect(resultForSavedPlan(source(), null, inputs)).toEqual(one);
    expect(typeof one.code).toBe('string');
  });

  it('I42: every stored v1 demo input opens; null, junk and v2 inputs open too', () => {
    for (const stored of [sofaInputs, carInputs, emptyCheckInputs('invest', TODAY), null, 'junk', [], {}]) {
      expect(typeof computeV3(source(), null, stored).result.code).toBe('string');
    }
    const v2 = toStoredV2(readStoredCheck(sofaInputs).check);
    const fromV2 = computeV3(source(), null, v2).result;
    expect(fromV2.code).toBe(computeV3(source(), null, sofaInputs).result.code);
    expect(fromV2.reasons).not.toContain('legacy_upgraded');
  });

  it('D-54: with nothing set up the demo sofa needs input and every account use is null (D-54, D-59)', () => {
    const r = computeV3(source(), null, sofaInputs).result;
    expect(r.code).toBe('needs_input');
    // D-54, D-59 (05.1-44): the engine asks account_use_question first, and every account reaches it with use null.
    expect(r.missing[0]).toBe('account_use_question');
    expect(buildV3Inputs(source(), null).accounts!.every((a) => a.use === null)).toBe(true);
  });

  it('D-54: once every account use is stated that question is gone', () => {
    const uses: Record<string, AccountUse> = Object.fromEntries(source().accounts.map((a) => [a.id, { kind: 'everyday' } as AccountUse]));
    const settings = v3s({ income_types: ['salary'], unspent_anchor: 300000, unspent_anchor_at: '2026-10-01' });
    const r = computeV3(source(), settings, sofaInputs, uses).result;
    expect(r.missing).not.toContain('account_use_question');
    expect(r.missing[0]).not.toBe('account_use_question');
    expect(typeof r.code).toBe('string');
  });

  it('D-22 stand-in: a post-anchor goal deposit lowers unspent money by exactly the amount, a withdrawal restores it', () => {
    const goals: SnapshotSource['goals'] = [{ id: 'g1', kind: 'pot', check_id: null, currency: 'USD', target: null, monthly_amount: null, ready_by: null, opening_saved: 0, done_at: null, deleted_at: null }];
    const settings = v3s({ unspent_anchor: 300000, unspent_anchor_at: '2026-10-01' });
    const unspent = (rows: Row[]): number => {
      const base = source();
      const e = computeV3({ ...base, goals, rows: [...base.rows, ...rows] }, settings, sofaInputs);
      return e.funds.unspent!.value;
    };
    const deposit = [row('d-out', 'demo-acct-everyday', -5000, { transfer_id: 'dep' }), row('d-in', 'demo-acct-savings', 5000, { transfer_id: 'dep', goal_id: 'g1' })];
    const withdrawal = [row('w-out', 'demo-acct-savings', -2000, { transfer_id: 'wd', goal_id: 'g1' }), row('w-in', 'demo-acct-everyday', 2000, { transfer_id: 'wd' })];
    const none = unspent([]);
    expect(unspent(deposit)).toBe(none - 5000);
    expect(unspent(withdrawal)).toBe(none + 2000);
    expect(unspent([...deposit, ...withdrawal])).toBe(none - 3000);
  });
});

describe('computeV3: a check typed in another currency (D-09)', () => {
  const RATES: FxLatestRow[] = [{ quote: 'USD', rate: '1.1', rate_date: '2026-10-02', source: 'frankfurter-v2' }];
  const eur = { ...sofaInputs, currency: 'EUR', advertised: 100_000 };

  it('converts at the stored rate and marks the purchase foreign', () => {
    const e = computeV3({ ...source(), rates: RATES }, null, eur);
    expect(e.purchase!.whole).toBe(110_000);
  });

  it('with no stored rate it carries no price and reads as needing input, never a guess', () => {
    const e = computeV3(source(), null, eur);
    expect(e.purchase).toBeNull();
    expect(e.result.code).toBe('needs_input');
    expect(e.result.missing).toContain('no_price');
  });

  it('a v2 check keeps the foreign mark it was stored with', () => {
    const stored = toStoredV2({ ...readStoredCheck(sofaInputs).check, foreign: { currency: 'EUR' as never, atTodaysRate: true } });
    expect(typeof computeV3(source(), null, stored).result.code).toBe('string');
  });
});

describe('reanswerSaved (D-20, I42)', () => {
  const stored = { ...sofaInputs, verdict_at_decision: 'fits' };

  it('a missing or legacy previous state re-baselines: never a change (C7)', () => {
    for (const prev of [null, 'fits', 'missing'] as const) {
      const r = reanswerSaved(prev, source(), null, stored);
      expect(r.changed).toBe(false);
      expect(r.reasons).toEqual([]);
      expect(r.seen).toEqual(seenOf(r.result));
    }
  });

  it('the same answer again is unchanged; a different earlier answer gives reasons', () => {
    const first = reanswerSaved(null, source(), null, stored);
    expect(reanswerSaved(first.seen, source(), null, stored).changed).toBe(false);
    const earlier = { ...first.seen, code: 'fits_month' as const };
    const again = reanswerSaved(earlier, source(), null, stored);
    expect(again.changed).toBe(true);
    expect(again.reasons).toContain('code_changed');
  });

  it('never touches the recorded decision on the stored inputs', () => {
    const copy = JSON.parse(JSON.stringify(stored)) as unknown;
    reanswerSaved(null, source(), null, stored);
    expect(stored).toEqual(copy);
    expect(stored.verdict_at_decision).toBe('fits');
  });
});

describe('computeV3: pending writes (L-09)', () => {
  it('a pending-write count above 0 adds the unsaved_changes notice and confidence reason; 0 does not', () => {
    const none = computeV3(source(), null, sofaInputs).result;
    expect(none.notices.map((n) => n.code)).not.toContain('unsaved_changes');
    const some = computeV3(source(), null, sofaInputs, undefined, null, 2).result;
    expect(some.notices.find((n) => n.code === 'unsaved_changes')!.values).toMatchObject({ count: 2 });
    expect(some.confidence.reasons).toContain('unsaved_changes');
  });
});

describe('computeV3: L-09 foreign v2 check', () => {
  const RATES: FxLatestRow[] = [{ quote: 'USD', rate: '1.1', rate_date: '2026-10-02', source: 'frankfurter-v2' }];
  const base = readStoredCheck(sofaInputs).check;
  const planPay = { mode: 'plan' as const, cadence: { unit: 'month', every: 1 }, count: 12, termMonths: null, apr: null, fees: { setup: 1000, perPeriod: 200, end: 300 }, deposit: 5000, tradeIn: 2000, quotedPayment: 9000, firstPayment: { kind: 'today' }, deferredInterestTerm: false };
  const foreign = { currency: 'EUR', atTodaysRate: true };
  const stored = (over: object) => toStoredV2({ ...base, ...over } as never);

  it('converts the price at the stored rate (same as a v1 check) and keeps the foreign mark', () => {
    const v2 = computeV3({ ...source(), rates: RATES }, null, stored({ price: 100_000, foreign }));
    expect(v2.purchase!.whole).toBe(110_000);
    expect(v2.purchase!.whole).toBe(computeV3({ ...source(), rates: RATES }, null, { ...sofaInputs, currency: 'EUR', advertised: 100_000 }).purchase!.whole);
    expect(v2.result.facts.find((f) => f.code === 'at_todays_rate')?.values).toMatchObject({ currency: 'EUR' });
  });

  it('with no stored rate the price is null: needs input, never 1:1', () => {
    const e = computeV3(source(), null, stored({ price: 100_000, foreign }));
    expect(e.purchase).toBeNull();
    expect(e.result.missing).toContain('no_price');
  });

  it('a snapshot with no stored rates at all reads as needing a price too', () => {
    const real = snapshotModule.buildDecideSnapshot(source());
    const spy = jest.spyOn(snapshotModule, 'buildDecideSnapshot').mockReturnValue({ ...real, fx: undefined });
    const e = computeV3(source(), null, stored({ price: 100_000, foreign }));
    spy.mockRestore();
    expect(e.purchase).toBeNull();
  });

  it('converts every amount of a plan check, its extras and its value', () => {
    const e = computeV3({ ...source(), rates: RATES }, null, stored({ price: 100_000, pay: planPay, extras: { sales_tax: 1000 }, oneOffFees: 500, value: { earnsMonthly: 100, savesMonthly: null, useYears: null, cheaperPrice: 90_000 }, foreign }));
    const home = computeV3({ ...source(), rates: RATES }, null, stored({ price: 110_000, pay: { ...planPay, fees: { setup: 1100, perPeriod: 220, end: 330 }, deposit: 5500, tradeIn: 2200, quotedPayment: 9900 }, extras: { sales_tax: 1100 }, oneOffFees: 550, value: { earnsMonthly: 110, savesMonthly: null, useYears: null, cheaperPrice: 99_000 }, foreign: null }));
    expect(e.purchase!.whole).toBe(home.purchase!.whole);
    expect(e.purchase!.schedule!.financed).toBe(home.purchase!.schedule!.financed);
  });

  it('a foreign check with no price yet stays priceless when a rate exists', () => {
    const e = computeV3({ ...source(), rates: RATES }, null, stored({ price: null, foreign }));
    expect(e.purchase).toBeNull();
    expect(e.result.missing).toContain('no_price');
  });

  it('a v2 check already in the home currency is unchanged', () => {
    const same = computeV3({ ...source(), rates: RATES }, null, stored({ price: 100_000, foreign: { currency: 'USD', atTodaysRate: true } }));
    expect(same.purchase!.whole).toBe(100_000);
  });
});

describe('computeV3WithoutRefunds (D-13) and reanswerSaved check id', () => {
  const refundSource = (linked: boolean): SnapshotSource => {
    const s = source();
    return {
      ...s,
      rows: [
        ...s.rows,
        row('buy', 'demo-acct-everyday', -90_000, { local_date: '2026-06-12' }),
        row('ref', 'demo-acct-everyday', 90_000, { local_date: '2026-09-20', is_refund: true, ...(linked ? { refund_of: 'buy' } : {}) }),
      ],
    };
  };
  const coverAnswer = (bool: boolean) => v3s({ answers: [{ kind: 'volatile_cover', key: 'c1', amount: null, bool_value: bool, on_date: null, check_id: 'c1' }] });

  it('equals computeV3 on the same records with the refund link removed', () => {
    expect(computeV3WithoutRefunds(refundSource(true), null, sofaInputs, null)).toEqual(computeV3(refundSource(false), null, sofaInputs));
  });

  it('with no refund link it equals computeV3; the check id and pending count are honoured', () => {
    expect(computeV3WithoutRefunds(source(), null, sofaInputs, null)).toEqual(computeV3(source(), null, sofaInputs));
    const e = computeV3WithoutRefunds(source(), coverAnswer(true), sofaInputs, 'c1', 1);
    expect(e).toEqual(computeV3(source(), coverAnswer(true), sofaInputs, undefined, 'c1', 1));
    expect(e.result.notices.map((n) => n.code)).toContain('unsaved_changes');
  });

  it('reanswerSaved reads the saved volatile-cover answer for the check id', () => {
    const v3 = coverAnswer(false);
    const withId = reanswerSaved(null, source(), v3, sofaInputs, 'c1', 1);
    expect(withId.result).toEqual(computeV3(source(), v3, sofaInputs, undefined, 'c1', 1).result);
    expect(withId.result.notices.map((n) => n.code)).toContain('unsaved_changes');
    expect(reanswerSaved(null, source(), v3, sofaInputs).result).toEqual(computeV3(source(), v3, sofaInputs).result);
  });
});
