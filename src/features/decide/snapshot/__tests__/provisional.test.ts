// D-69 (2026-10-22): a past line saved while its own rate was pending converts at the latest stored rate for its
// currency, is flagged provisional, caps confidence at fair, and is never written anywhere.
import { decide, type BuyCheck } from '@/engine/decide';
import { currencyCode, minorUnits } from '@/engine/money';
import * as conversion from '../conversion';
import { buildDecideSnapshot, type SnapshotSource } from '../buildSnapshot';
import type { SnapshotResult } from '../types';
import { CATEGORIES, USD_RATE, account, customCurrency, household, row, series, sourceOf, type SourceRow } from './helpers/sourceFixtures';

function logged(source: SnapshotSource): Extract<SnapshotResult, { kind: 'logged' }> {
  const result = buildDecideSnapshot(source);
  if (result.kind !== 'logged') throw new Error(`expected a logged snapshot, got ${result.kind}`);
  return result;
}

/** A EUR line saved offline: no stamp, home_amount null, rate pending. */
const unstamped = (over: Partial<SourceRow> = {}): SourceRow =>
  row({
    id: 'eur-pending',
    local_date: '2026-09-20',
    original_amount: -10_000,
    original_currency: 'EUR',
    home_currency: 'USD',
    home_amount: null,
    orig_per_eur: null,
    ...over,
  });

const withRows = (extra: SourceRow[], over: Partial<SnapshotSource> = {}): SnapshotSource => {
  const base = household();
  return { ...base, ...over, rows: [...base.rows, ...extra] };
};

const lineOf = (r: Extract<SnapshotResult, { kind: 'logged' }>, month: string, id: string) =>
  r.snapshot.months.find((m) => m.month === month)?.lines.find((l) => l.id === id);

const cash = (price: number): BuyCheck => ({
  kind: 'buy',
  currency: currencyCode('USD'),
  price: minorUnits(price),
  dayFees: minorUnits(0),
  itemType: 'general',
  runningCostsNet: minorUnits(0),
  payment: { method: 'cash' },
});

/** Six full months (April..September) of the household pattern, so a clean read is strong. */
function sixMonths(extra: SourceRow[] = [], over: Partial<SnapshotSource> = {}): SnapshotSource {
  const rows: SourceRow[] = [];
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) {
    rows.push(row({ id: `inc-${m}`, local_date: `${m}-01`, original_amount: 300_000, category_id: 'c-inc', recurring_series_id: 's-pay' }));
    rows.push(row({ id: `rent-${m}`, local_date: `${m}-02`, original_amount: -100_000, category_id: 'c-house' }));
    rows.push(row({ id: `food-${m}`, local_date: `${m}-10`, original_amount: -40_000, category_id: 'c-food' }));
  }
  return sourceOf({
    rows: [...rows, ...extra],
    series: [series({ id: 's-pay', amount: 300_000, anchor_date: '2026-04-01', category_id: 'c-inc' })],
    accounts: [account({ id: 'chk', name: 'Checking' })],
    balances: { chk: 900_000 },
    categories: CATEGORIES,
    ...over,
  });
}

afterEach(() => jest.restoreAllMocks());

describe('D-69 provisional conversion', () => {
  it('a pending line converts at the latest stored rate and is flagged provisional', () => {
    const r = logged(withRows([unstamped()], { rates: [USD_RATE] }));
    expect(lineOf(r, '2026-09', 'eur-pending')?.amount).toBe(11_000); // 100.00 EUR at 1.1
    expect(r.provisional).toEqual({ rowCount: 1, rateDate: '2026-10-14' });
    expect(r.snapshot.provisionalRates).toBe(true);
    expect(r.unconverted).toBeNull();
    expect(r.meta.unconvertedRows).toBe(0);
    expect(r.conversions).toEqual([]); // the basis line for it is the provisional one, not a balance conversion note
  });

  it('a pending line with no stored rate stays missing', () => {
    const r = logged(withRows([unstamped()], { rates: [] }));
    expect(lineOf(r, '2026-09', 'eur-pending')).toBeUndefined();
    expect(r.unconverted).toEqual({ currencies: ['EUR'], rowCount: 1 });
    expect(r.provisional).toBeNull();
    expect(r.snapshot.provisionalRates).toBeUndefined();
  });

  it('a stamped line ignores the provisional path', () => {
    const spy = jest.spyOn(conversion, 'provisionalHomeAmount');
    const stamped = unstamped({ id: 'eur-stamped', home_amount: -11_200, orig_per_eur: '1.0000000000' });
    const r = logged(withRows([stamped], { rates: [USD_RATE] }));
    expect(lineOf(r, '2026-09', 'eur-stamped')?.amount).toBe(11_200);
    expect(r.provisional).toBeNull();
    expect(r.snapshot.provisionalRates).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    logged(withRows([unstamped()], { rates: [USD_RATE] }));
    expect(spy).toHaveBeenCalled(); // the spy is wired: an unstamped line does take the path
  });

  it('a custom currency converts through its reference, dated by the earlier leg', () => {
    const tok = unstamped({ id: 'tok', original_currency: 'TOK', original_amount: -2_000 });
    const r = logged(withRows([tok], { rates: [USD_RATE], customCurrencies: [customCurrency()] }));
    expect(lineOf(r, '2026-09', 'tok')?.amount).toBe(1_000); // 1 TOK = 0.5 USD
    expect(r.provisional).toEqual({ rowCount: 1, rateDate: '2026-10-10' });
  });

  it('counts a line once, and only when its month is used', () => {
    const early = unstamped({ id: 'eur-early', local_date: '2025-11-20' }); // a full month outside the 6-month window
    const pendingOut = unstamped({ id: 'eur-due', status: 'pending', local_date: '2026-09-28' });
    const r = logged(withRows([early, pendingOut], { rates: [USD_RATE], upcomingRows: [pendingOut] }));
    expect(r.provisional).toEqual({ rowCount: 1, rateDate: '2026-10-14' });
  });

  it('a pending one-off with no stamp becomes a dated outflow at the provisional amount', () => {
    const due = unstamped({ id: 'eur-later', status: 'pending', local_date: '2026-12-01' });
    const r = logged({ ...household(), rates: [USD_RATE], upcomingRows: [due] });
    expect(r.snapshot.scheduledOutflows).toEqual([{ id: 'eur-later', date: '2026-12-01', amount: 11_000, currency: 'USD' }]);
    expect(r.provisional).toEqual({ rowCount: 1, rateDate: '2026-10-14' });
  });

  it('a pending card charge with no stamp counts on the card at the provisional amount', () => {
    const card = account({ id: 'card', name: 'Card', kind: 'credit' });
    const charge = unstamped({ id: 'eur-card', status: 'pending', account_id: 'card', local_date: '2026-12-01' });
    const base = household();
    const r = logged({ ...base, rates: [USD_RATE], accounts: [...base.accounts, card], balances: { ...base.balances, card: 0 }, upcomingRows: [charge] });
    expect(r.snapshot.debts.find((d) => d.id === 'card')?.balance).toBe(11_000);
    expect(r.provisional).toEqual({ rowCount: 1, rateDate: '2026-10-14' });
  });

  it('an internal move or an inflow is not counted', () => {
    const out = unstamped({ id: 'mv-out', status: 'pending', transfer_id: 't-mv', local_date: '2026-12-01' });
    const into = row({ id: 'mv-in', status: 'pending', transfer_id: 't-mv', account_id: 'sav', original_amount: 11_000, local_date: '2026-12-01' });
    const refund = unstamped({ id: 'eur-in', status: 'pending', original_amount: 5_000, local_date: '2026-12-02' });
    const r = logged({ ...household(), rates: [USD_RATE], upcomingRows: [out, into, refund] });
    expect(r.snapshot.scheduledOutflows).toEqual([]);
    expect(r.provisional).toBeNull();
  });

  it('confidence is capped at Medium (fair) with the reason listed', () => {
    const clean = logged(sixMonths([], { rates: [USD_RATE] }));
    expect(decide(clean.snapshot, cash(10_000)).verdict.confidence).toEqual({ level: 'strong', reasons: [] });
    const r = logged(sixMonths([unstamped()], { rates: [USD_RATE] }));
    expect(decide(r.snapshot, cash(10_000)).verdict.confidence).toEqual({ level: 'fair', reasons: ['provisional_rates'] });
  });

  it('nothing provisional is written: the source rows are untouched and the value lives only in the snapshot', () => {
    const line = Object.freeze(unstamped());
    const source = withRows([line], { rates: [USD_RATE] });
    const before = JSON.stringify(source);
    const r = logged(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(line.home_amount).toBeNull();
    expect(line.orig_per_eur).toBeNull();
    expect(lineOf(r, '2026-09', 'eur-pending')?.amount).toBe(11_000);
    // a later build after the sweep stamps the real rate reads the stamp, not the provisional value
    const swept = logged(withRows([{ ...line, home_amount: -10_900, orig_per_eur: '1.0000000000' }], { rates: [USD_RATE] }));
    expect(lineOf(swept, '2026-09', 'eur-pending')?.amount).toBe(10_900);
    expect(swept.provisional).toBeNull();
  });
});

describe('provisionalHomeAmount', () => {
  const { provisionalHomeAmount } = conversion;
  it('needs no rate for zero or a home-currency amount', () => {
    expect(provisionalHomeAmount({ original_amount: 0, original_currency: 'JPY' }, 'USD', [], [], '2026-10-15')).toEqual({ amount: 0, rateDate: null });
    expect(provisionalHomeAmount({ original_amount: -500, original_currency: 'USD' }, 'USD', [], [], '2026-10-15')).toEqual({ amount: -500, rateDate: null });
  });

  it('converts at the latest stored rate, or returns null when none is stored', () => {
    expect(provisionalHomeAmount({ original_amount: -10_000, original_currency: 'EUR' }, 'USD', [USD_RATE], [], '2026-10-15')).toEqual({
      amount: -11_000,
      rateDate: '2026-10-14',
    });
    expect(provisionalHomeAmount({ original_amount: -10_000, original_currency: 'JPY' }, 'USD', [USD_RATE], [], '2026-10-15')).toBeNull();
  });
});

describe('own-currency lines after a home-currency change', () => {
  const GBP_RATE = { quote: 'GBP', rate: '0.8', rate_date: '2026-10-12', source: 'frankfurter-v2' } as const;
  /** Saved while home was GBP: same-currency stamp, no orig_per_eur. Read now under USD. */
  const gbpLine = (over: Partial<SourceRow> = {}): SourceRow =>
    row({
      id: 'gbp-old',
      local_date: '2026-09-20',
      original_amount: -10_000,
      original_currency: 'GBP',
      home_currency: 'GBP',
      home_amount: -10_000,
      orig_per_eur: null,
      ...over,
    });

  it('converts at the latest stored rate as a normal conversion, not a provisional one', () => {
    const r = logged(withRows([gbpLine()], { rates: [USD_RATE, GBP_RATE] }));
    expect(lineOf(r, '2026-09', 'gbp-old')?.amount).toBe(13_750); // 100.00 GBP at 1.375 USD per GBP
    expect(r.provisional).toBeNull();
    expect(r.snapshot.provisionalRates).toBeUndefined();
    expect(r.unconverted).toBeNull();
    expect(r.conversions).toEqual([{ currency: 'GBP', rateText: '1.3750000000', rateDate: '2026-10-12' }]);
  });

  it('stays missing, never guessed, when no GBP rate is stored', () => {
    const r = logged(withRows([gbpLine()], { rates: [USD_RATE] }));
    expect(lineOf(r, '2026-09', 'gbp-old')).toBeUndefined();
    expect(r.unconverted).toEqual({ currencies: ['GBP'], rowCount: 1 });
  });

  it('adds no conversion note for a line outside the used months', () => {
    const r = logged(withRows([gbpLine({ id: 'gbp-early', local_date: '2025-11-20' })], { rates: [USD_RATE, GBP_RATE] }));
    expect(r.conversions).toEqual([]);
  });
});
