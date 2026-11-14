// BO-07 connection points with a live owner (05.5 D-08). Point 1 shape: src/engine/month/__tests__/bo07.point1.contract.test.ts (05.5-01).
// Todos: src/engine/month/__tests__/bo07.*.contract.test.ts.
import * as fs from 'fs';
import * as path from 'path';
import { goals, autoLoan, LEDGER_TODAY } from '@/engine/grow/__tests__/fixtures/ledger';
import { RECURRING_SERIES_COLUMNS } from '@/db/rows';
import { debtPointOf, goalPointsOf, safetyNetPointOf } from '@/features/grow/connect';
import type { DebtPoint, DebtSourceRow, GoalPoint, GoalSourceRow, SafetyNetPoint } from '@/features/grow/connect';

const identity = (amount: number, currency: string): number | null => (currency === 'USD' ? amount : null);

const goalRow: GoalSourceRow = {
  id: 'g1', name: 'Lisbon', currency: 'USD', target: goals.lisbon.target, monthly_amount: goals.lisbon.monthly, ready_by: '2027-06-01',
  opening_saved: goals.lisbon.opening, kind: 'wait', account_id: 'a-sav', check_id: 'chk-1', done_at: null, deleted_at: null,
  up_front_only: true,
};
const netRow: GoalSourceRow = {
  id: 'net', name: 'Safety net', currency: 'USD', target: goals.safetyNet.target, monthly_amount: 10000, ready_by: null,
  opening_saved: goals.safetyNet.saved, kind: 'pot', account_id: 'a-sav', check_id: null, done_at: null, deleted_at: null,
  is_safety_net: true, locked: true, protect: true, net_confirmed_at: '2026-10-01T00:00:00Z',
};
const loanRow: DebtSourceRow = {
  id: 'd1', kind: 'loan', account_id: null, check_id: 'chk-d', balance: autoLoan.balance, apr: autoLoan.apr, minimum_payment: autoLoan.payment,
  secured: true, is_housing: false, due_day: autoLoan.dueDay, paid_off_on: '2026-01-01', deleted_at: null,
};

const GOAL_KEYS: (keyof GoalPoint)[] = [
  'id', 'name', 'kind', 'target', 'saved', 'monthlyAmount', 'readyBy', 'locked', 'upFrontOnly', 'linkedCheckId', 'accountId', 'bucket', 'done',
];
const NET_KEYS: (keyof SafetyNetPoint)[] = ['goalId', 'size', 'saved', 'protect', 'locked', 'accountId', 'confirmedAt'];
const DEBT_KEYS: (keyof DebtPoint)[] = [
  'id', 'balance', 'apr', 'minimum', 'dueDay', 'payoffDate', 'totalInterest', 'paidInFull', 'linkedCheckId', 'paidOff',
];

// Compile-time exactness: a key added to or dropped from a point type breaks these lines.
type Exact<T, K extends keyof T> = Exclude<keyof T, K> extends never ? true : never;
const goalExact: Exact<GoalPoint, (typeof GOAL_KEYS)[number]> = true;
const netExact: Exact<SafetyNetPoint, (typeof NET_KEYS)[number]> = true;
const debtExact: Exact<DebtPoint, (typeof DEBT_KEYS)[number]> = true;

const sorted = (o: object): string[] => Object.keys(o).sort();

describe('BO-07 point 2: goal (owner Grow)', () => {
  it('GoalPoint has exactly its 13 keys', () => {
    expect(goalExact).toBe(true);
    const [p] = goalPointsOf([goalRow], [], identity);
    expect(sorted(p)).toEqual([...GOAL_KEYS].sort());
  });

  it('goalPointsOf returns target, saved, monthlyAmount, readyBy, upFrontOnly and linkedCheckId as stored', () => {
    const [p] = goalPointsOf([goalRow], [], identity);
    expect(p).toMatchObject({
      target: goals.lisbon.target, saved: goals.lisbon.opening, monthlyAmount: goals.lisbon.monthly,
      readyBy: '2027-06-01', upFrontOnly: true, linkedCheckId: 'chk-1',
    });
  });
});

describe('BO-07 point 3: safety net (owner Grow)', () => {
  it('SafetyNetPoint has exactly its 7 keys', () => {
    expect(netExact).toBe(true);
    const p = safetyNetPointOf([netRow], [], identity, 'USD');
    expect(p).not.toBeNull();
    expect(sorted(p as SafetyNetPoint)).toEqual([...NET_KEYS].sort());
  });

  it('no flagged row gives null', () => {
    expect(safetyNetPointOf([goalRow], [], identity, 'USD')).toBeNull();
  });

  it('one flagged row gives its goalId, size, saved and protect', () => {
    expect(safetyNetPointOf([goalRow, netRow], [], identity, 'USD')).toMatchObject({
      goalId: 'net', size: goals.safetyNet.target, saved: goals.safetyNet.saved, protect: true,
    });
  });

  it('two flagged live rows give exactly one point, one of the two goals', () => {
    // The database holds this at one by the unique index savings_goals_one_safety_net; the point stays a single value even on bad cache.
    const second: GoalSourceRow = { ...netRow, id: 'net2' };
    const p = safetyNetPointOf([netRow, second], [], identity, 'USD');
    expect(p).not.toBeNull();
    expect(['net', 'net2']).toContain((p as SafetyNetPoint).goalId);
  });
});

describe('BO-07 point 4: debt (owner Grow)', () => {
  it('DebtPoint has exactly its 10 keys', () => {
    expect(debtExact).toBe(true);
    expect(sorted(debtPointOf(loanRow, LEDGER_TODAY))).toEqual([...DEBT_KEYS].sort());
  });

  it('debtPointOf maps a loan row to its point', () => {
    expect(debtPointOf(loanRow, LEDGER_TODAY)).toMatchObject({
      balance: autoLoan.balance, apr: expect.anything(), minimum: autoLoan.payment, dueDay: autoLoan.dueDay,
      paidOff: true, linkedCheckId: 'chk-d',
    });
  });
});

const SRC = path.resolve(__dirname, '../..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('BO-07 point 5: bills (owner Activity)', () => {
  it('the recurring series columns carry the bill facts', () => {
    const cols = RECURRING_SERIES_COLUMNS.split(',').map((c) => c.trim());
    for (const c of ['freq', 'anchor_date', 'end_date', 'occurrence_count', 'end_reason', 'goal_id', 'account_id', 'category_id']) {
      expect(cols).toContain(c);
    }
  });

  it('no Decide source file reads or writes recurring_series directly', () => {
    const files = sourceFiles(path.join(SRC, 'features/decide'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /\.from\(\s*['"`]recurring_series['"`]\s*\)/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
