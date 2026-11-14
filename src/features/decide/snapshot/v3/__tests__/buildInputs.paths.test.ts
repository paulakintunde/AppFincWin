// 05.5-12: the paths the ported buildInputs cases do not reach (settlements, provisional rates, pending one-offs, debts, caps).
import { CAD_RATE, CATEGORIES as FIX_CATEGORIES, USD_RATE, account as fxAccount, debt as fxDebt, goal as fxGoal, household, paymentLink, row as fxRow, series as fxSeries, settings as fxSettings, sourceOf } from '../../__tests__/helpers/sourceFixtures';
import { buildInputs } from '../buildInputs';
import type { InputsSource } from '../buildInputsParts';
import { v3s } from './v3Fixtures';

describe('buildInputs: settlements, skipped rows and rows outside the window', () => {
  const hh = household();
  const lines = (s: InputsSource) => buildInputs(s, null).months.flatMap((m) => m.lines);
  it('D-06: a settlement row adds nothing to any month; the same source without it is deep-equal', () => {
    const settle = { ...fxRow({ id: 'settle', local_date: '2026-09-12', original_amount: -7_000 }), isSettlement: true };
    const withIt: InputsSource = { ...hh, rows: [...hh.rows, settle] };
    expect(buildInputs(withIt, null).months).toEqual(buildInputs(hh, null).months);
    expect(lines(withIt).some((l) => l.id === 'settle')).toBe(false);
  });
  it('a Savings-category outflow is not a line, a skipped one is not either, and a row two years back is outside the window', () => {
    const extra = [
      fxRow({ id: 'sav-out', local_date: '2026-09-12', original_amount: -3_000, category_id: 'c-sav' }),
      fxRow({ id: 'skip', local_date: '2026-09-13', original_amount: -3_000, status: 'skipped' }),
      fxRow({ id: 'old', local_date: '2024-05-13', original_amount: -3_000 }),
    ];
    const ids = lines({ ...hh, rows: [...hh.rows, ...extra] }).map((l) => l.id);
    for (const gone of ['sav-out', 'skip', 'old']) expect(ids).not.toContain(gone);
  });
  it('goal-tagged and debt-tagged single legs take their own roles', () => {
    const goals = [fxGoal({ id: 'g-live' })];
    const extra = [
      fxRow({ id: 'g-out', local_date: '2026-09-12', original_amount: -3_000, goal_id: 'g-live' }),
      fxRow({ id: 'g-in', local_date: '2026-09-13', original_amount: 3_000, goal_id: 'g-live' }),
      fxRow({ id: 'd-out', local_date: '2026-09-14', original_amount: -3_000, debt_id: 'x' }),
      fxRow({ id: 'd-in', local_date: '2026-09-15', original_amount: 3_000, debt_id: 'x' }),
    ];
    const all = lines({ ...hh, goals, rows: [...hh.rows, ...extra] });
    const role = (id: string) => all.find((l) => l.id === id)!.role;
    expect([role('g-out'), role('g-in'), role('d-out'), role('d-in')]).toEqual(['envelope_deposit', 'envelope_withdrawal', 'debt_payment', 'other_in']);
  });
  it('a Transfer-category series is neither a bill nor income', () => {
    const s = { ...hh, series: [...hh.series, fxSeries({ id: 's-x', category_id: 'c-xfer', amount: -9_000 })] };
    expect(buildInputs(s, null).series.map((x) => x.id)).not.toContain('s-x');
  });
});

describe('buildInputs: provisional rates and rows no rate converts', () => {
  const hh = household({ rates: [USD_RATE, CAD_RATE] });
  const cad = (over: Record<string, unknown>) => fxRow({ original_currency: 'CAD', home_currency: 'USD', home_amount: null, orig_per_eur: null, original_amount: -5_000, ...over });
  const jpy = (over: Record<string, unknown>) => fxRow({ original_currency: 'JPY', home_currency: 'USD', home_amount: null, ...over });
  it('a past line with no stamp is converted at the latest rate and marks the answer provisional', () => {
    const out = buildInputs({ ...hh, rows: [...hh.rows, cad({ id: 'p1', local_date: '2026-09-12' })] }, null);
    expect(out.provisionalRates).toBe(true);
    expect(out.months.flatMap((m) => m.lines).some((l) => l.id === 'p1')).toBe(true);
  });
  it('a line no rate converts is left out and marks nothing', () => {
    const out = buildInputs({ ...hh, rows: [...hh.rows, jpy({ id: 'jp', local_date: '2026-09-12' })] }, null);
    expect(out.provisionalRates).toBe(false);
    expect(out.months.flatMap((m) => m.lines).some((l) => l.id === 'jp')).toBe(false);
  });
  it('a goal-tagged paid row with a provisional rate marks the answer; one no rate converts does not', () => {
    const goals = [fxGoal({ id: 'g1' })];
    const on = buildInputs({ ...hh, goals, rows: [...hh.rows, cad({ id: 'gp', local_date: '2026-10-10', goal_id: 'g1' })] }, null);
    expect(on.provisionalRates).toBe(true);
    const off = buildInputs({ ...hh, goals, rows: [...hh.rows, jpy({ id: 'gj', local_date: '2026-10-10', goal_id: 'g1' })] }, null);
    expect(off.provisionalRates).toBe(false);
  });
  it('a pending one-off on a cash account with a provisional rate marks the answer', () => {
    const s = { ...hh, rows: [...hh.rows, cad({ id: 'pe', local_date: '2026-10-20', status: 'pending' })] };
    expect(buildInputs(s, null).provisionalRates).toBe(true);
  });
});

describe('buildInputs: pending one-offs on cards and loans', () => {
  const card = fxAccount({ id: 'card', kind: 'credit' });
  const loanAcc = fxAccount({ id: 'loanacc', kind: 'loan' });
  const base = (): InputsSource => {
    const hh = household();
    return { ...hh, accounts: [...hh.accounts, card, loanAcc], balances: { ...hh.balances, card: -100_000, loanacc: -500_000 }, debts: [fxDebt({ id: 'd-card', kind: 'card', account_id: 'card', min_percent: '2', min_interest_added: false, min_floor: 2_000 })] };
  };
  const pending = (over: Record<string, unknown>) => fxRow({ status: 'pending', local_date: '2026-10-20', original_amount: -10_000, ...over });
  const cardDebt = (s: InputsSource) => buildInputs(s, null).debts.find((d) => d.id === 'card')!;
  it('a pending charge on the card adds to what is owed; a written payment link takes it back out of the minimum base', () => {
    const b = base();
    const s = { ...b, rows: [...b.rows, pending({ id: 'pc', account_id: 'card' })] };
    expect(cardDebt(s).balance).toBe(110_000);
    const linked = { ...s, paymentLinks: [paymentLink({ check_id: 'ck', target_id: 'x' })], writtenRowLinks: [{ check_id: 'ck', target_id: 'pc' }, { check_id: 'other', target_id: 'pc' }] };
    expect(cardDebt(linked).balance).toBe(110_000);
    expect(cardDebt(linked).minimum).toBeLessThanOrEqual(cardDebt(s).minimum);
  });
  it('pending rows that do not count: income, no account, archived account, series rows, internal moves', () => {
    const b = base();
    const rows = [
      pending({ id: 'in', account_id: 'card', original_amount: 10_000 }),
      pending({ id: 'noacct', account_id: 'ghost' }),
      pending({ id: 'arch', account_id: 'old' }),
      pending({ id: 'ser', account_id: 'card', recurring_series_id: 's-pay' }),
      pending({ id: 'mv-out', account_id: 'chk', transfer_id: 'mv' }),
      pending({ id: 'mv-in', account_id: 'sav', transfer_id: 'mv', original_amount: 10_000 }),
      pending({ id: 'to-card-out', account_id: 'chk', transfer_id: 'tc' }),
      pending({ id: 'to-card-in', account_id: 'card', transfer_id: 'tc', original_amount: 10_000 }),
      pending({ id: 'nopartner', account_id: 'chk', transfer_id: 'np' }),
      pending({ id: 'jp', account_id: 'card', original_currency: 'JPY', home_currency: 'USD', home_amount: null }),
    ];
    const s = { ...b, accounts: [...b.accounts, fxAccount({ id: 'old', archived_at: '2026-01-01' })], rows: [...b.rows, ...rows] };
    expect(cardDebt(s).balance).toBe(100_000);
  });
  it('a loan account named by a recorded loan takes no pending charge', () => {
    const b = base();
    const s = { ...b, debts: [...b.debts, fxDebt({ id: 'd-loan', kind: 'loan', account_id: 'loanacc', balance: 400_000 })], rows: [...b.rows, pending({ id: 'pl', account_id: 'loanacc' })] };
    const ids = buildInputs(s, null).debts.map((d) => d.id);
    expect(ids).toContain('d-loan');
    expect(ids).not.toContain('loanacc');
  });
});

describe('buildInputs: debts, cards and accounts', () => {
  const hh = household({ rates: [USD_RATE, CAD_RATE] });
  it('loans: a paid-off loan adds nothing, one no rate converts is left out, a series and a check link cover later runs', () => {
    const s: InputsSource = {
      ...hh,
      series: [...hh.series, fxSeries({ id: 'ls1', amount: -20_000 }), fxSeries({ id: 'ls2', amount: -20_000 })],
      debts: [fxDebt({ id: 'paid', paid_off_on: '2026-01-01' }), fxDebt({ id: 'jp', currency: 'JPY' }), fxDebt({ id: 'ok', account_id: 'chk', check_id: 'ck', series_id: 'ls1', apr: '7.5' })],
      paymentLinks: [paymentLink({ check_id: 'ck', target_id: 'ls2' }), paymentLink({ check_id: 'unrelated', target_id: 'ls3' })],
    };
    const out = buildInputs(s, null);
    expect(out.debts.map((d) => d.id)).toEqual(['ok']);
    expect(out.debts[0]).toMatchObject({ seriesId: 'ls1' });
    expect(out.series.map((x) => x.id)).not.toContain('ls1');
    expect(out.series.map((x) => x.id)).not.toContain('ls2');
  });
  it('cards: stored terms, a stored floor no rate converts, market terms in their currency only, paid in full', () => {
    const cards = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => fxAccount({ id, kind: 'credit' }));
    const s: InputsSource = {
      ...hh,
      accounts: [...hh.accounts, ...cards, fxAccount({ id: 'c6', kind: 'credit', currency: 'EUR' })],
      balances: { ...hh.balances, c1: -100_000, c2: -100_000, c3: -100_000, c4: -100_000, c5: 0, c6: -100_000 },
      debts: [
        fxDebt({ id: 'd1', kind: 'card', account_id: 'c1', min_percent: '3', min_interest_added: true, min_floor: 1_000, apr: '20' }),
        fxDebt({ id: 'd2', kind: 'card', account_id: 'c2', min_percent: '3', min_interest_added: true, min_floor: 1_000, currency: 'JPY' }),
        fxDebt({ id: 'd4', kind: 'card', account_id: 'c4', paid_in_full: true }),
      ],
    };
    const by = Object.fromEntries(buildInputs(s, null).debts.map((d) => [d.id, d]));
    expect(by.c1!.minimum).toBeGreaterThan(0);
    expect(by.c2!.minimum).toBe(0);
    expect(by.c3!.minimum).toBeGreaterThan(0);
    expect(by.c4!.minimum).toBe(0);
    expect(by.c5).toBeUndefined();
    expect(by.c6!.minimum).toBe(0);
  });
  it('a card or loan account no rate converts is left out', () => {
    const s: InputsSource = { ...hh, accounts: [...hh.accounts, fxAccount({ id: 'cj', kind: 'credit', currency: 'JPY' }), fxAccount({ id: 'lo', kind: 'loan' })], balances: { ...hh.balances, cj: -5_000, lo: -9_000 } };
    expect(buildInputs(s, null).debts.map((d) => d.id)).toEqual(['lo']);
  });
  it('accounts: overdraft limit converted, no rate means no limit, unknown kind is other, no-rate balance is flagged', () => {
    const s: InputsSource = {
      ...hh,
      accounts: [
        { ...fxAccount({ id: 'a1', currency: 'CAD' }), overdraft_limit: 10_000, overdraft_rate: '19.9' },
        { ...fxAccount({ id: 'a2', currency: 'EUR' }), overdraft_limit: 10_000 },
        { ...fxAccount({ id: 'a3' }), kind: 'weird' as never },
        fxAccount({ id: 'a4', currency: 'JPY' }),
      ],
      balances: { a1: 1_000, a2: 0, a3: 5, a4: 5 },
    };
    const by = Object.fromEntries(buildInputs(s, null).accounts!.map((a) => [a.id, a]));
    expect(by.a1!.overdraftLimit).toBeGreaterThan(0);
    expect(by.a1!.overdraftRate).not.toBeNull();
    expect(by.a3!.kind).toBe('other');
    expect(by.a4).toMatchObject({ noRate: true });
  });
  it('an overdraft limit no rate converts is none', () => {
    const s: InputsSource = { ...hh, rates: [], accounts: [{ ...fxAccount({ id: 'a2', currency: 'EUR' }), overdraft_limit: 10_000, overdraft_rate: 'abc' }], balances: { a2: 0 } };
    expect(buildInputs(s, null).accounts![0]).toMatchObject({ overdraftLimit: null, overdraftRate: null });
    const s2: InputsSource = { ...hh, rates: [USD_RATE], accounts: [{ ...fxAccount({ id: 'a5', currency: 'EUR' }), overdraft_limit: 10_000, overdraft_rate: 'abc' }], balances: { a5: 0 } };
    expect(buildInputs(s2, null).accounts![0]!.overdraftRate).toBeNull();
  });
});

describe('buildInputs: settings, notes and caps', () => {
  const hh = household();
  it('an imported statement period can make a month full', () => {
    const s: InputsSource = { ...hh, rows: hh.rows.filter((r) => r.local_date >= '2026-07-05'), statementPeriods: [{ account_id: 'chk', period_start: '2026-07-01', period_end: '2026-07-31' }] };
    expect(buildInputs(s, null).months.some((m) => m.full)).toBe(true);
  });
  it('settings money in another currency is dropped, with or without a v3 row', () => {
    const foreign: InputsSource = { ...hh, settings: fxSettings({ currency: 'GBP' }) };
    expect(buildInputs(foreign, v3s({ everyday_override: 5_000 })).everydayOverride).toBeNull();
    expect(buildInputs(foreign, null).everydayOverride).toBeNull();
  });
  it('typed estimates fill from the quick figures, and none appear once a full month exists', () => {
    const typedOnly = sourceOf({ accounts: [fxAccount({ id: 'chk' })], balances: { chk: 100 }, categories: FIX_CATEGORIES, settings: fxSettings({ rough_income: 400_000, rough_spending: 300_000 }) });
    expect(buildInputs(typedOnly, v3s({ rough_saving: 1_000 })).typedEstimates).toEqual({ income: 400_000, expenses: 300_000, saving: 1_000, debt: 0, invest: 0, asOf: typedOnly.today });
    expect(buildInputs({ ...hh, settings: fxSettings({ rough_income: 1, rough_spending: 1 }) }, null).typedEstimates).toBeNull();
  });
  it('OFO-4: a category cap becomes an always-on line; rules-document category caps are ignored (D-11); no cap, no line', () => {
    const rules = v3s({ own_lines: [{ id: 'own_cap', on: true, spec: { kind: 'category_monthly_cap', categoryId: 'c-food', cap: 1 } }] });
    const s: InputsSource = { ...hh, categoryCaps: { 'c-food': 50_000, 'c-house': null, 'c-bad': -5 } };
    const caps = buildInputs(s, rules).limits.lines.filter((l) => l.spec.kind === 'category_monthly_cap');
    expect(caps).toEqual([{ id: 'cap_c-food', on: true, source: 'own', spec: { kind: 'category_monthly_cap', categoryId: 'c-food', cap: 50_000 } }]);
    expect(buildInputs(hh, rules).limits.lines.some((l) => l.spec.kind === 'category_monthly_cap')).toBe(false);
  });
  it('unsaved writes count only as a whole positive number; the state or province passes only in the stored shape', () => {
    const n = (v: number | undefined) => buildInputs({ ...hh, unsavedWrites: v }, null).unsavedWrites;
    expect([n(3), n(0), n(-1), n(1.5), n(undefined)]).toEqual([3, 0, 0, 0, 0]);
    const sub = (v: string | null | undefined, region: string | null = 'US') => buildInputs({ ...hh, region, regionSubdivision: v }, null).regionSubdivision;
    expect([sub('CA'), sub('california'), sub(null), sub('CA', null)]).toEqual(['CA', null, null, null]);
  });
  it('skipped occurrences are listed once each, in order, and ignore deleted or series-less rows', () => {
    const sk = (o: Record<string, unknown>) => fxRow({ status: 'skipped', ...o });
    const s: InputsSource = { ...hh, rows: [...hh.rows, sk({ id: 'k1', recurring_series_id: 'b', local_date: '2026-09-02' }), sk({ id: 'k2', recurring_series_id: 'a', local_date: '2026-09-05' }), sk({ id: 'k3', recurring_series_id: 'a', local_date: '2026-09-05' }), sk({ id: 'k4', recurring_series_id: null }), sk({ id: 'k5', recurring_series_id: 'a', deleted_at: 'x' })] };
    expect(buildInputs(s, null).skipped).toEqual([{ seriesId: 'a', date: '2026-09-05' }, { seriesId: 'b', date: '2026-09-02' }]);
  });
  it('readiness answers: a well-formed one comes through, a malformed one or another kind is ignored', () => {
    const w = (key: string) => ({ kind: 'readiness_waiver' as const, key, amount: null, bool_value: null, on_date: null, check_id: null });
    const other = { kind: 'pay_arrival' as const, key: 'nope', amount: null, bool_value: null, on_date: null, check_id: null };
    expect(buildInputs(hh, v3s({ answers: [other, w('nonsense'), w('income-elsewhere')] })).waivers).toEqual([{ kind: 'income_elsewhere' }]);
  });
});
