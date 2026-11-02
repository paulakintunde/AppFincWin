import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluate } from '../../evaluate';
import { toEngineInputs } from './fixture';
import { loadCases } from './loader';
import { pick } from './pick';
import { validateCase, type RightAnswerCase } from './schema';

function minimalCase(over: Partial<RightAnswerCase> = {}): RightAnswerCase {
  return {
    id: 'OD-99',
    topic: 'overdraft',
    persona: 'Test (invented)',
    situation: 'A small purchase.',
    fixture: {
      asOf: '2026-10-10',
      currency: 'USD',
      region: null,
      pay: { amount: 300000, cadence: 'monthly', nextDate: '2026-11-01', setupAmount: null, lastThree: null },
      usualMonth: { bills: 100000, everyday: 80000, essentialEveryday: 50000 },
      thisMonth: { received: 300000, billsPaid: 100000, billsDue: 0, everydaySoFar: 20000 },
      historyMonths: 6,
      quickEstimates: null,
      recordsAsOf: null,
      accounts: [{ id: 'a1', kind: 'checking', name: 'Everyday', balance: 150000, overdraftLimit: null, overdraftRate: null, use: 'everyday' }],
      safetyNet: null,
      bills: [],
      debts: [],
      userLine: null,
      factLines: false,
      check: { price: 6000, taxPercent: null, taxIncluded: null, oneOffFees: 0, pay: { mode: 'once' } },
    },
    expected: { code: 'fits_month', variant: null, afterBuy: { month: null, usualMonth: null }, readyBy: null, mustHaveReasons: [], mustHaveFacts: [], mustNotHaveFacts: [] },
    why: 'It is small.',
    fixIds: [],
    status: 'draft',
    approvedAt: null,
    ownerReason: null,
    expertNote: null,
    ...over,
  };
}

describe('validateCase', () => {
  it('accepts a valid case', () => {
    expect(validateCase(minimalCase())).toEqual([]);
  });
  it('rejects an unknown topic', () => {
    expect(validateCase(minimalCase({ topic: 'nope' as never })).join()).toMatch(/unknown topic/);
  });
  it('rejects an id prefix that does not match the topic', () => {
    expect(validateCase(minimalCase({ id: 'SN-01' })).join()).toMatch(/prefix must be OD/);
  });
  it('rejects a negative price', () => {
    const c = minimalCase();
    c.fixture.check.price = -1;
    expect(validateCase(c).join()).toMatch(/negative/);
  });
  it('rejects money that is not a whole number', () => {
    const c = minimalCase();
    c.fixture.usualMonth.bills = 100.5;
    expect(validateCase(c).join()).toMatch(/whole number/);
  });
  it('rejects a bad date', () => {
    const c = minimalCase();
    c.fixture.asOf = '2026-02-31';
    expect(validateCase(c).join()).toMatch(/asOf is not a date/);
  });
  it('rejects an approved case with no approvedAt', () => {
    expect(validateCase(minimalCase({ status: 'approved' })).join()).toMatch(/needs approvedAt/);
  });
  it('rejects an answer code that does not exist', () => {
    const c = minimalCase();
    c.expected.code = 'fits_maybe';
    expect(validateCase(c).join()).toMatch(/unknown answer code/);
  });
  it('rejects a variant that is not on the allowed list', () => {
    const c = minimalCase();
    c.expected.variant = 'net_not_full';
    expect(validateCase(c).join()).toMatch(/unknown variant/);
  });
  it('accepts every round-1 variant', () => {
    for (const v of ['not_cleared', 'no_net', 'small_net', 'costly_debt', 'borrowing_costs_more', 'tight']) {
      const c = minimalCase();
      c.expected.variant = v;
      expect(validateCase(c)).toEqual([]);
    }
  });
  it('rejects a non-object', () => {
    expect(validateCase(null)).toEqual(['case must be an object']);
  });
});

describe('loadCases', () => {
  it('throws on a duplicate id across files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-'));
    const body = JSON.stringify({ topic: 'overdraft', cases: [minimalCase()] });
    fs.writeFileSync(path.join(dir, 'a.json'), body);
    fs.writeFileSync(path.join(dir, 'b.json'), body);
    expect(() => loadCases(dir)).toThrow(/duplicate case id OD-99/);
  });
  it('returns cases sorted by id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-'));
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ topic: 'overdraft', cases: [minimalCase({ id: 'OD-02' }), minimalCase({ id: 'OD-01' })] }));
    expect(loadCases(dir).map((c) => c.id)).toEqual(['OD-01', 'OD-02']);
  });
});

describe('toEngineInputs and pick', () => {
  it('builds inputs evaluate() accepts, and picks the expected shape', () => {
    const { inputs, check } = toEngineInputs(minimalCase().fixture);
    const picked = pick(evaluate(inputs, check));
    expect(typeof picked.code).toBe('string');
    expect(picked.facts).toEqual(expect.any(Array));
    expect(picked.afterBuy.usualMonth).toBeNull();
  });
  it('maps a plan, other cadences, regions and debts without throwing', () => {
    const f = minimalCase().fixture;
    f.pay.cadence = 'fortnightly';
    f.region = { country: 'US', subdivision: 'CA' };
    f.check = { price: 90000, taxPercent: '8.25', taxIncluded: false, oneOffFees: 100, pay: { mode: 'plan', months: 6, apr: '10', fees: 0, deposit: 0, firstPaymentDate: '2026-11-10' } };
    f.debts = [{ id: 'd1', kind: 'card', balance: 50000, minimum: 2500, apr: '20', dueDay: 5, joint: false }];
    f.accounts.push({ id: 'a2', kind: 'savings', name: 'Net', balance: 10000, overdraftLimit: null, overdraftRate: null, use: 'emergency' });
    f.accounts.push({ id: 'a3', kind: 'savings', name: 'Kept', balance: 10000, overdraftLimit: null, overdraftRate: null, use: 'untouched' });
    f.accounts.push({ id: 'a4', kind: 'card', name: 'Card', balance: 0, overdraftLimit: null, overdraftRate: null, use: null });
    f.thisMonth = { received: 0, billsPaid: 0, billsDue: 0, everydaySoFar: 0 };
    const { inputs, check } = toEngineInputs(f);
    expect(() => evaluate(inputs, check)).not.toThrow();
  });
});
