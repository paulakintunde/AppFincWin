import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { FxLatestRow, TransactionRow } from '@/db/rows';
import { attachRoleFor, toPastDecisions } from '../pastDecisions';

const check = (p: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({
    id: 'c1',
    status: 'bought',
    deleted_at: null,
    decided_at: '2026-01-10T12:00:00Z',
    inputs: {},
    estimate_day_one: 50000,
    estimate_monthly_payment: 10000,
    estimate_running: 2000,
    ...p,
  }) as DecideCheckRow;

const link = (p: Partial<DecideLinkRow> & { target_id: string }): DecideLinkRow =>
  ({ check_id: 'c1', entity: 'transactions', role: 'day_one', deleted_at: null, ...p }) as DecideLinkRow;

const line = (p: Partial<TransactionRow> & { id: string }): TransactionRow =>
  ({
    status: 'paid',
    deleted_at: null,
    local_date: '2026-01-10',
    home_currency: 'USD',
    home_amount: -50000,
    original_amount: -50000,
    original_currency: 'USD',
    orig_per_eur: null,
    recurring_series_id: null,
    ...p,
  }) as TransactionRow;

const rates: FxLatestRow[] = [
  { quote: 'USD', rate: '1.10', rate_date: '2026-03-01', source: 'frankfurter-v2' },
  { quote: 'GBP', rate: '0.85', rate_date: '2026-03-01', source: 'frankfurter-v2' },
];
const base = { rates, customs: [], home: 'USD', timeZone: 'UTC' };

describe('attachRoleFor', () => {
  it('is a day-one cost within 7 days of the decision, else a running cost', () => {
    const at = '2026-01-10T12:00:00Z';
    expect(attachRoleFor(at, '2026-01-10', 'UTC')).toBe('day_one');
    expect(attachRoleFor(at, '2026-01-17', 'UTC')).toBe('day_one');
    expect(attachRoleFor(at, '2026-01-18', 'UTC')).toBe('running_cost');
    expect(attachRoleFor(at, '2026-01-09', 'UTC')).toBe('running_cost');
  });

  it('IN-B01: the decided date is taken in the app time zone, not the device one', () => {
    const lateEvening = '2026-01-11T06:00:00Z'; // 22:00 on the 10th in Los Angeles
    expect(attachRoleFor(lateEvening, '2026-01-17', 'America/Los_Angeles')).toBe('day_one');
    expect(attachRoleFor(lateEvening, '2026-01-10', 'America/Los_Angeles')).toBe('day_one');
    expect(attachRoleFor(lateEvening, '2026-01-10', 'Asia/Tokyo')).toBe('running_cost');
  });
});

describe('toPastDecisions', () => {
  it('skips decisions that are not bought, deleted, undated, or without the payment split', () => {
    const out = toPastDecisions({
      ...base,
      today: '2026-06-01',
      links: [],
      lines: [],
      decisions: [
        check({ id: 'a', status: 'open' }),
        check({ id: 'b', deleted_at: '2026-02-01T00:00:00Z' }),
        check({ id: 'c', decided_at: null }),
        check({ id: 'd', estimate_monthly_payment: null }),
      ],
    });
    expect(out).toEqual([]);
  });

  it('skips a decision with no checkpoint reached yet', () => {
    const out = toPastDecisions({ ...base, today: '2026-02-01', links: [], lines: [], decisions: [check()] });
    expect(out).toEqual([]);
  });

  it('a figure with no linked line of its role is null', () => {
    const out = toPastDecisions({
      ...base,
      today: '2026-06-01',
      decisions: [check()],
      links: [link({ target_id: 'l1', role: 'day_one' })],
      lines: [line({ id: 'l1' })],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.currency).toBe('USD');
    expect(out[0]!.estimate).toEqual({ dayOne: 50000, monthlyPayment: 10000, runningCosts: 2000 });
    expect(out[0]!.actual).toEqual({ dayOne: 50000, monthlyPayment: null, runningCosts: null });
  });

  it('before day 90 the 30-day figures are used', () => {
    const out = toPastDecisions({
      ...base,
      today: '2026-02-15', // day 30 reached (2026-02-09), day 90 not
      decisions: [check()],
      links: [
        link({ target_id: 'p1', role: 'payment' }),
        link({ target_id: 'p2', role: 'payment' }),
        link({ target_id: 'late', role: 'payment' }),
      ],
      lines: [
        line({ id: 'p1', local_date: '2026-01-20', home_amount: -4000 }),
        line({ id: 'p2', local_date: '2026-02-05', home_amount: -6001 }),
        line({ id: 'late', local_date: '2026-02-12', home_amount: -9999 }),
      ],
    });
    expect(out[0]!.actual.monthlyPayment).toBe(10001);
  });

  it('at day 90 the monthly figure is the window sum over whole months, half-up', () => {
    const out = toPastDecisions({
      ...base,
      today: '2026-06-01',
      decisions: [check()],
      links: [
        link({ target_id: 'r1', role: 'running_cost' }),
        link({ target_id: 'r2', role: 'running_cost' }),
        link({ target_id: 'early', role: 'running_cost' }),
      ],
      lines: [
        line({ id: 'r1', local_date: '2026-02-01', home_amount: -1000 }),
        line({ id: 'r2', local_date: '2026-03-01', home_amount: -1000 }),
        line({ id: 'early', local_date: '2026-01-01', home_amount: -99999 }),
      ],
    });
    // 2000 / 3 months = 666.67 -> 667
    expect(out[0]!.actual.runningCosts).toBe(667);
  });

  it('counts series links, and ignores deleted, other-check, unpaid and debt links', () => {
    const out = toPastDecisions({
      ...base,
      today: '2026-06-01',
      decisions: [check()],
      links: [
        link({ target_id: 's1', entity: 'recurring_series', role: 'payment' }),
        link({ target_id: 'x1', role: 'payment', deleted_at: '2026-02-01T00:00:00Z' }),
        link({ target_id: 'x2', role: 'payment', check_id: 'other' }),
        link({ target_id: 'x3', role: 'payment' }),
        link({ target_id: 'd1', entity: 'debts', role: 'payment' }),
        link({ target_id: 'missing', role: 'payment' }),
      ],
      lines: [
        line({ id: 'm1', recurring_series_id: 's1', local_date: '2026-02-01', home_amount: -3000 }),
        line({ id: 'm2', recurring_series_id: 's1', local_date: '2026-03-01', home_amount: -3000 }),
        line({ id: 'm3', recurring_series_id: 's1', local_date: '2026-04-01', home_amount: -3000 }),
        line({ id: 'm4', recurring_series_id: 's1', local_date: '2026-05-01', home_amount: -3000 }),
        line({ id: 'x1', home_amount: -1 }),
        line({ id: 'x2', home_amount: -1 }),
        line({ id: 'x3', status: 'pending', home_amount: -1 }),
        line({ id: 'gone', recurring_series_id: 's1', deleted_at: '2026-02-01T00:00:00Z', home_amount: -777 }),
        line({ id: 'other', recurring_series_id: 'zzz', home_amount: -888 }),
      ],
    });
    expect(out[0]!.actual.monthlyPayment).toBe(3000);
  });

  it('a line waiting for a rate makes its figure null, never a partial sum', () => {
    const out = toPastDecisions({
      ...base,
      today: '2026-06-01',
      decisions: [check()],
      links: [link({ target_id: 'a' }), link({ target_id: 'b' })],
      lines: [
        line({ id: 'a' }),
        line({ id: 'b', home_currency: 'EUR', home_amount: null, original_currency: 'EUR', orig_per_eur: null }),
      ],
    });
    expect(out[0]!.actual.dayOne).toBeNull();
  });

  it('a monthly figure with a line waiting for a rate is null', () => {
    const out = toPastDecisions({
      ...base,
      today: '2026-06-01',
      decisions: [check()],
      links: [link({ target_id: 'a', role: 'payment' })],
      lines: [
        line({
          id: 'a',
          local_date: '2026-02-01',
          home_currency: 'EUR',
          home_amount: null,
          original_currency: 'EUR',
        }),
      ],
    });
    expect(out[0]!.actual.monthlyPayment).toBeNull();
  });

  it('a foreign-currency decision is converted or left out', () => {
    const gbp = check({ inputs: { currency: 'GBP' }, estimate_day_one: null, estimate_running: null });
    const out = toPastDecisions({ ...base, today: '2026-06-01', decisions: [gbp], links: [], lines: [] });
    expect(out).toHaveLength(1);
    expect(out[0]!.currency).toBe('USD');
    expect(out[0]!.estimate.monthlyPayment).toBe(12941);
    expect(out[0]!.estimate.dayOne).toBe(0);
    expect(out[0]!.estimate.runningCosts).toBe(0);

    const jpy = check({ id: 'j', inputs: { currency: 'JPY' } });
    expect(toPastDecisions({ ...base, today: '2026-06-01', decisions: [jpy], links: [], lines: [] })).toEqual([]);
    const blank = check({ id: 'k', inputs: { currency: '' } });
    expect(toPastDecisions({ ...base, today: '2026-06-01', decisions: [blank], links: [], lines: [] })).toHaveLength(1);
  });
});
