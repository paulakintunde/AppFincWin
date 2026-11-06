// 05.4-35: the stored data added in 05.4 reaches the v3 inputs: account kind and overdraft (FIN-03), debt due day (FIN-04), the
// interim safety net (FIN-01, D-33, D-35, D-61), the fact-lines switch (D-08), state/province (D-19, D-20, D-142), D-43 for every
// records basis, and the check's purpose (D-41).
import { percent } from '@/engine/payoff';
import type { FxLatestRow } from '@/db/rows';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import { buildDecideSnapshot, type SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { computeV3 } from '../computeV3';
import { v3s } from './v3Fixtures';

const TODAY = '2026-10-03';
const EVERYDAY = 'demo-acct-everyday';
const SAVINGS = 'demo-acct-savings';
const CASH = 'demo-acct-cash';
const INVEST = 'demo-acct-investments';
const CARD = 'demo-acct-card';
const RATES: FxLatestRow[] = [
  { quote: 'USD', rate: '1.1', rate_date: '2026-10-02', source: 'frankfurter-v2' },
  { quote: 'GBP', rate: '0.85', rate_date: '2026-10-02', source: 'frankfurter-v2' },
];

type Account = SnapshotSource['accounts'][number];
type Debt = SnapshotSource['debts'][number];

const base = (): SnapshotSource => demoSource(TODAY);
const withAccount = (id: string, over: Partial<Account>, src: SnapshotSource = base()): SnapshotSource => ({
  ...src,
  accounts: src.accounts.map((a) => (a.id === id ? { ...a, ...over } : a)),
});
const withDebt = (id: string, over: Partial<Debt>, src: SnapshotSource = base()): SnapshotSource => ({
  ...src,
  debts: src.debts.map((d) => (d.id === id ? { ...d, ...over } : d)),
});
const account = (src: SnapshotSource, id: string) => buildV3Inputs(src, null).accounts!.find((a) => a.id === id);

describe('accounts: kind and overdraft (FIN-03, ARC-25, D-144)', () => {
  it('a checking account with a limit and a rate passes both as stored', () => {
    const a = account(withAccount(EVERYDAY, { overdraft_limit: 50000, overdraft_rate: '22' }), EVERYDAY);
    expect(a).toMatchObject({ kind: 'checking', overdraftLimit: 50000 });
    expect(a!.overdraftRate).toBe(percent('22'));
  });

  it('maps every stored kind: savings stays savings; cash, investment and other are other; an unknown kind is other', () => {
    const src = withAccount('demo-acct-cash', { kind: 'other' }, base());
    const i = buildV3Inputs(src, null);
    const kinds = Object.fromEntries(i.accounts!.map((a) => [a.id, a.kind]));
    expect(kinds).toEqual({ [EVERYDAY]: 'checking', [SAVINGS]: 'savings', [CASH]: 'other', [INVEST]: 'other' });
    expect(buildV3Inputs(base(), null).accounts!.find((a) => a.id === CASH)!.kind).toBe('other');
    const odd = withAccount(EVERYDAY, { kind: 'brokerage' as Account['kind'] });
    expect(account(odd, EVERYDAY)!.kind).toBe('other');
  });

  it('D-144: an investment account is never kept savings, but its balance still counts', () => {
    const a = account(base(), INVEST);
    expect(a).toMatchObject({ kind: 'other', balance: 480000 });
  });

  it('a savings account keeps its limit as stored (the engine ignores it)', () => {
    expect(account(withAccount(SAVINGS, { overdraft_limit: 10000 }), SAVINGS)).toMatchObject({ kind: 'savings', overdraftLimit: 10000 });
  });

  it('ARC-25: no limit and no rate stay null; an unreadable rate or limit is null, never a default', () => {
    expect(account(base(), EVERYDAY)).toMatchObject({ overdraftLimit: null, overdraftRate: null });
    expect(account(withAccount(EVERYDAY, { overdraft_limit: null, overdraft_rate: null }), EVERYDAY)).toMatchObject({ overdraftLimit: null, overdraftRate: null });
    expect(account(withAccount(EVERYDAY, { overdraft_rate: '22%' }), EVERYDAY)!.overdraftRate).toBeNull();
    expect(account(withAccount(EVERYDAY, { overdraft_rate: '' }), EVERYDAY)!.overdraftRate).toBeNull();
    expect(account(withAccount(EVERYDAY, { overdraft_limit: -5 }), EVERYDAY)!.overdraftLimit).toBeNull();
    expect(account(withAccount(EVERYDAY, { overdraft_limit: 12.5 }), EVERYDAY)!.overdraftLimit).toBeNull();
  });

  it('a 0% rate and a 0 limit are kept as typed', () => {
    const a = account(withAccount(EVERYDAY, { overdraft_limit: 0, overdraft_rate: '0' }), EVERYDAY);
    expect(a).toMatchObject({ overdraftLimit: 0, overdraftRate: percent('0') });
  });

  it('a limit in another currency is converted and rounded down; with no rate it is no limit', () => {
    // home USD; GBP 1.00 = 1.1 / 0.85 USD = 1.294117.. -> 333 GBP minor = 430.94.. -> 430 USD minor (down, never up)
    const gbp = withAccount(EVERYDAY, { currency: 'GBP', overdraft_limit: 333 }, { ...base(), rates: RATES });
    expect(account(gbp, EVERYDAY)!.overdraftLimit).toBe(430);
    // no rate: a zero balance needs none (the account stays), but the limit cannot be converted -> null (cautious)
    const noRate = withAccount(EVERYDAY, { currency: 'GBP', overdraft_limit: 333 }, { ...base(), balances: { ...base().balances, [EVERYDAY]: 0 } });
    expect(account(noRate, EVERYDAY)).toMatchObject({ balance: 0, overdraftLimit: null });
  });
});

describe('debts: due day (FIN-04)', () => {
  it('a stored due day passes; null or out of range is null', () => {
    const due = (d: number | null | undefined) => buildV3Inputs(withDebt('demo-debt-0', { due_day: d }), null).debts.find((x) => x.id === 'demo-debt-0')!.dueDay;
    expect(due(15)).toBe(15);
    expect(due(1)).toBe(1);
    expect(due(31)).toBe(31);
    expect(due(null)).toBeNull();
    expect(due(undefined)).toBeNull();
    expect(due(0)).toBeNull();
    expect(due(32)).toBeNull();
    expect(due(2.5)).toBeNull();
  });

  it("a card's due day is read from its debts row on that card account", () => {
    const owing = { ...base(), balances: { ...base().balances, [CARD]: -50000 } };
    const src = withDebt('demo-debt-card', { due_day: 20, paid_in_full: false }, owing);
    const card = buildV3Inputs(src, null).debts.find((d) => d.id === CARD);
    expect(card).toMatchObject({ kind: 'card', balance: 50000, dueDay: 20 });
    // a deleted card row is not read
    const gone = withDebt('demo-debt-card', { due_day: 20, deleted_at: '2026-10-01T00:00:00Z' }, owing);
    expect(buildV3Inputs(gone, null).debts.find((d) => d.id === CARD)!.dueDay).toBeNull();
  });
});

describe('D-43: debts and overdraft limits reach the engine whatever the records basis', () => {
  const quick = (): SnapshotSource => {
    const b = base();
    return {
      ...withAccount(EVERYDAY, { overdraft_limit: 50000 }, b),
      rows: [],
      series: [],
      balances: { ...b.balances, [CARD]: -50000 },
      debts: b.debts.filter((d) => d.kind === 'card').map((d) => ({ ...d, paid_in_full: false })),
      settings: { ...b.settings!, rough_income: 400000, rough_spending: 250000 },
    };
  };

  it('a quick-estimates user with one card debt and a checking overdraft limit: both reach the inputs', () => {
    const src = quick();
    expect(buildDecideSnapshot(src).kind).toBe('rough');
    const i = buildV3Inputs(src, null);
    expect(i.typedEstimates).not.toBeNull();
    expect(i.debts.map((d) => [d.id, d.kind, d.balance])).toEqual([[CARD, 'card', 50000]]);
    expect(i.accounts!.find((a) => a.id === EVERYDAY)).toMatchObject({ kind: 'checking', overdraftLimit: 50000 });
  });

  it('with nothing to go on (no records, no estimates), the debts still reach the inputs', () => {
    const src = { ...quick(), settings: null };
    expect(buildDecideSnapshot(src).kind).toBe('none');
    expect(buildV3Inputs(src, null).debts.map((d) => d.id)).toEqual([CARD]);
  });

  it('a result without the debt list (an older built snapshot) gives no debts', () => {
    const src = quick();
    const built = buildDecideSnapshot(src);
    expect(buildV3Inputs(src, null, { ...built, debtRecords: undefined }).debts).toEqual([]);
  });
});

describe('safety net (FIN-01, D-33, D-35, D-61)', () => {
  const settings = (over: Partial<NonNullable<SnapshotSource['settings']>> = {}): SnapshotSource => ({
    ...base(),
    settings: { ...base().settings!, currency: 'USD', ...over },
  });

  it('no settings row: null, so the engine defaults apply (on, starter, locked, saved = the emergency fund)', () => {
    expect(buildV3Inputs(base(), null).safetyNet).toBeNull();
  });

  it('protect off with no size: protect false, size null, saved = the emergency fund, locked as stored', () => {
    const i = buildV3Inputs(settings({ reserve: 300000 }), v3s({ safety_net_protect: false, safety_net_size: null, safety_net_locked: false }));
    expect(i.safetyNet).toEqual({ protect: false, size: null, saved: 300000, locked: false });
  });

  it('D-35: saved is the money in the net, never the size; no emergency fund saves 0', () => {
    const i = buildV3Inputs(settings({ reserve: null }), v3s({ safety_net_protect: true, safety_net_size: 900000, safety_net_locked: true }));
    expect(i.safetyNet).toEqual({ protect: true, size: 900000, saved: 0, locked: true });
  });

  it('an old cached row without the columns reads as the column defaults', () => {
    expect(buildV3Inputs(settings({ reserve: 1000 }), v3s()).safetyNet).toEqual({ protect: true, size: null, saved: 1000, locked: true });
  });

  it('CR-03: settings money in another currency drops the size (and the fund); protect and locked are kept', () => {
    const i = buildV3Inputs(settings({ currency: 'GBP', reserve: 300000 }), v3s({ safety_net_protect: false, safety_net_size: 900000, safety_net_locked: false }));
    expect(i.safetyNet).toEqual({ protect: false, size: null, saved: 0, locked: false });
  });

  it('an unreadable size is the starter', () => {
    expect(buildV3Inputs(settings(), v3s({ safety_net_size: -1 })).safetyNet!.size).toBeNull();
  });
});

describe('fact lines (D-08)', () => {
  it('are on: no stored switch exists yet (08.1)', () => {
    expect(buildV3Inputs(base(), null).factLines).toBe(true);
    expect(buildV3Inputs(base(), v3s()).factLines).toBe(true);
  });
});

describe('state or province (D-19, D-20, D-142)', () => {
  const sub = (region: string | null, regionSubdivision?: string | null) => buildV3Inputs({ ...base(), region, regionSubdivision }, null);

  it('region US with California: both pass', () => {
    expect(sub('US', 'CA')).toMatchObject({ region: 'US', regionSubdivision: 'CA' });
  });

  it('a device-derived country with no stored subdivision: null', () => {
    expect(sub('GB')).toMatchObject({ region: 'GB', regionSubdivision: null });
    expect(sub('US', null)).toMatchObject({ region: 'US', regionSubdivision: null });
  });

  it('D-142: a stored subdivision passes with whatever country was resolved (the engine checks the pair)', () => {
    expect(sub('CA', 'CA').regionSubdivision).toBe('CA');
  });

  it('no country: no subdivision; a malformed code: null', () => {
    expect(sub(null, 'CA').regionSubdivision).toBeNull();
    expect(sub('US', 'california').regionSubdivision).toBeNull();
    expect(sub('US', '').regionSubdivision).toBeNull();
  });
});

describe('need or want (D-41)', () => {
  it("a stored v2 check's purpose reaches the judged check unchanged", () => {
    const stored = { v: 2, price: 50000, purpose: { kind: 'preset', value: 'necessity' } };
    const e = computeV3(base(), null, stored);
    expect(e.purchase?.purpose).toEqual({ kind: 'preset', value: 'necessity' });
  });
});
