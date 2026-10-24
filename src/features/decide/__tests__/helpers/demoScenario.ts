// D-19 / DCU-11: the demo scenario's single source. scripts/check-decide-demo-mirror.mjs (05-51) compares it with the SQL seed.
// Pure test helper: whole-unit figures live in demoScenario.json and become integer minor units (x100, USD) here.
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { DebtSource, SnapshotSource } from '../../snapshot/buildSnapshot';
import type { CheckInputs, InputLine } from '../../snapshot/types';
import raw from './demoScenario.json';

type Row = SnapshotSource['rows'][number];
type Account = SnapshotSource['accounts'][number];

export const DEMO = raw;

const MINOR = 100; // USD: two decimals; the demo account is USD-home (the seed scales non-USD homes)
const SALARY_SERIES = 'demo-series-salary';
const CATEGORY_IDS: Record<string, string> = {
  Income: 'cat-income',
  Housing: 'cat-housing',
  Groceries: 'cat-groceries',
  Utilities: 'cat-utilities',
  Transport: 'cat-transport',
  Dining: 'cat-dining',
  Subscriptions: 'cat-subscriptions',
  Insurance: 'cat-insurance',
  Debt: 'cat-debt',
  Transfer: 'cat-transfer',
};
// With no typed floor the engine uses the monthly investing figure itself, leaving the 'inv' margin at exactly 0, which the
// engine flags on_edge (04 D-43). The demo types a 0 investing floor so the screenshots carry no edge flag (UI-SPEC constraint).
const NO_LIMITS: NonNullable<SnapshotSource['settings']> = {
  currency: null,
  rough_income: null,
  rough_spending: null,
  reserve: null,
  dsr_line: null,
  housing_line: null,
  unsecured_multiple: null,
  investing_floor: null,
  saving_floor: null,
  basis_override: null,
};
const acct = (key: string): string => `demo-acct-${key}`;

function monthBack(today: string, back: number): string {
  const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1));
  return d.toISOString().slice(0, 7);
}
const daysIn = (month: string): number => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

function makeRow(today: string, month: string, day: number, id: string, account: string, major: number, key: string, extra: Partial<Row> = {}): Row {
  const date = `${month}-${String(Math.min(day, daysIn(month))).padStart(2, '0')}`;
  const amount = Math.round(major * MINOR);
  return {
    id,
    account_id: acct(account),
    local_date: date,
    original_amount: amount,
    original_currency: DEMO.currency,
    home_currency: DEMO.currency,
    home_amount: amount,
    orig_per_eur: null,
    status: date <= today ? 'paid' : 'pending',
    is_refund: false,
    transfer_id: null,
    recurring_series_id: null,
    category_id: CATEGORY_IDS[key] ?? null,
    deleted_at: null,
    ...extra,
  };
}

/** The current month and the six full months before it, in the order the seed inserts them. */
export function demoRows(today: string): Row[] {
  const rows: Row[] = [];
  for (let back = DEMO.pastMonths; back >= 0; back -= 1) {
    const month = monthBack(today, back);
    const s = DEMO.salary;
    rows.push(makeRow(today, month, s.day, `demo-${month}-salary`, s.account, s.major, s.key, { recurring_series_id: SALARY_SERIES }));
    DEMO.template.forEach((t, i) => rows.push(makeRow(today, month, t.day, `demo-${month}-t${i}`, t.account, t.major, t.key)));
    DEMO.transfers.forEach((t, i) => {
      const transfer_id = `demo-${month}-x${i}`;
      rows.push(makeRow(today, month, t.day, `${transfer_id}-out`, t.from, -t.major, 'Transfer', { transfer_id }));
      rows.push(makeRow(today, month, t.day, `${transfer_id}-in`, t.to, t.major, 'Transfer', { transfer_id }));
    });
  }
  return rows;
}

function debtOf(partial: Partial<DebtSource> & Pick<DebtSource, 'id' | 'kind'>): DebtSource {
  return {
    account_id: null,
    check_id: null,
    series_id: null,
    currency: DEMO.currency,
    balance: 0,
    apr: null,
    minimum_payment: 0,
    secured: false,
    min_percent: null,
    min_interest_added: null,
    min_floor: null,
    paid_in_full: false,
    is_housing: false,
    version: 1,
    deleted_at: null,
    ...partial,
  };
}

export function demoSource(today: string): SnapshotSource {
  const rows = demoRows(today);
  const accounts: Account[] = DEMO.accounts.map((a) => ({
    id: acct(a.key),
    name: a.name,
    kind: a.kind as Account['kind'],
    currency: DEMO.currency,
    archived_at: null,
    deleted_at: null,
  }));
  const balances: Record<string, number> = {};
  for (const a of DEMO.accounts) balances[acct(a.key)] = a.opening * MINOR;
  for (const r of rows) if (r.status === 'paid') balances[r.account_id] = (balances[r.account_id] ?? 0) + r.original_amount;
  const categories: Record<string, string | null> = {};
  for (const [key, id] of Object.entries(CATEGORY_IDS)) categories[id] = key;
  const debts = DEMO.debts.map((d, i) =>
    debtOf({
      id: `demo-debt-${i}`,
      kind: d.kind as DebtSource['kind'],
      balance: d.balance * MINOR,
      minimum_payment: d.minimum * MINOR,
      apr: d.apr,
      secured: d.secured,
    })
  );
  debts.push(debtOf({ id: 'demo-debt-card', kind: 'card', account_id: acct(DEMO.cardDebt.account), paid_in_full: DEMO.cardDebt.paid_in_full }));
  return {
    today,
    homeCurrency: DEMO.currency,
    region: 'US',
    rows,
    upcomingRows: [],
    series: [
      {
        id: SALARY_SERIES,
        account_id: acct(DEMO.salary.account),
        amount: DEMO.salary.major * MINOR,
        currency: DEMO.currency,
        freq: 'monthly',
        anchor_date: `${monthBack(today, DEMO.pastMonths)}-${String(DEMO.salary.day).padStart(2, "0")}`,
        end_date: null,
        occurrence_count: null,
        category_id: CATEGORY_IDS[DEMO.salary.key] ?? null,
        deleted_at: null,
      },
    ],
    accounts,
    balances,
    rates: [],
    categories,
    settings: { ...NO_LIMITS, investing_floor: DEMO.settings.investingFloor * MINOR },
    debts,
    goals: [],
    statementPeriods: [],
    customCurrencies: [],
    changes: [],
    paymentLinks: [],
    writtenRowLinks: [],
  };
}

const lines = (list: readonly { name: string; amount: number; category: string | null }[], prefix: string): InputLine[] =>
  list.map((l, i) => ({
    id: `${prefix}${i}`,
    name: l.name,
    amount: l.amount,
    note: '',
    counted: true,
    seriesId: null,
    category: l.category as InputLine['category'],
  }));

const base = emptyCheckInputs('buy', '2026-10-15');

export const sofaInputs: CheckInputs = {
  ...base,
  currency: DEMO.currency,
  name: DEMO.sofa.name,
  itemType: DEMO.sofa.itemType as CheckInputs['itemType'],
  advertised: DEMO.sofa.advertised,
  method: DEMO.sofa.method as CheckInputs['method'],
  combine: DEMO.sofa.combine,
};

/** The APR is the typed text from the JSON, exactly as a user would enter it; nothing here derives or defaults a rate. */
export const carInputs: CheckInputs = {
  ...base,
  currency: DEMO.currency,
  name: DEMO.car.name,
  itemType: DEMO.car.itemType as CheckInputs['itemType'],
  advertised: DEMO.car.advertised,
  method: DEMO.car.method as CheckInputs['method'],
  combine: DEMO.car.combine,
  loan: { ...base.loan, ...DEMO.car.loan },
  runningCosts: lines(DEMO.car.runningCosts, 'rc-'),
  replaces: lines(DEMO.car.replaces, 'rp-'),
};
