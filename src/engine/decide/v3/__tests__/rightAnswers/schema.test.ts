import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluate } from '../../evaluate';
import { toEngineInputs } from './fixture';
import { loadCases } from './loader';
import { pick } from './pick';
import { VARIANTS, validateCase, type RightAnswerCase } from './schema';

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
  it('accepts review and planner notes as text or null, and rejects an empty note', () => {
    expect(validateCase(minimalCase({ reviewNote: 'Owner check.', plannerNote: null }))).toEqual([]);
    expect(validateCase(minimalCase({ plannerNote: '' })).join()).toMatch(/plannerNote must be text or null/);
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
  it('D-58: accepts a regular saving and rejects each bad field', () => {
    const withSaving = (saving: unknown, asOf = '2026-10-10') => {
      const c = minimalCase();
      (c.fixture.usualMonth as { saving?: unknown }).saving = saving;
      c.fixture.asOf = asOf;
      return validateCase(c).join();
    };
    expect(withSaving({ amount: 20000, day: 6, movedThisMonth: false })).toBe('');
    expect(withSaving({ amount: 20000, day: 6, movedThisMonth: true })).toBe('');
    expect(withSaving({ amount: 0, day: 6, movedThisMonth: false })).toMatch(/saving.amount must be a whole number above 0/);
    expect(withSaving({ amount: 1.5, day: 6, movedThisMonth: false })).toMatch(/saving.amount must be a whole number above 0/);
    expect(withSaving({ amount: 20000, day: 0, movedThisMonth: false })).toMatch(/saving.day must be 1 to 28/);
    expect(withSaving({ amount: 20000, day: 29, movedThisMonth: false })).toMatch(/saving.day must be 1 to 28/);
    expect(withSaving({ amount: 20000, day: 6, movedThisMonth: 'no' })).toMatch(/movedThisMonth must be true or false/);
    expect(withSaving({ amount: 20000, day: 12, movedThisMonth: true })).toMatch(/cannot be moved this month before its day/);
    expect(withSaving({ amount: 20000, day: 12, movedThisMonth: true }, 'bad')).not.toMatch(/before its day/);
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
  it('D-58: a regular saving is a fixed saving series, logged on its day each full month and this month once moved', () => {
    const f = minimalCase().fixture;
    f.usualMonth.saving = { amount: 20000, day: 6, movedThisMonth: true };
    const { inputs } = toEngineInputs(f);
    expect(inputs.series.find((s) => s.id === 'saving')).toMatchObject({ role: 'saving', amount: 20000, savingMode: 'fixed', anchorDate: '2026-04-06' });
    const lines = inputs.months.flatMap((m) => m.lines).filter((l) => l.seriesId === 'saving');
    expect(lines.map((l) => l.date)).toEqual(['2026-04-06', '2026-05-06', '2026-06-06', '2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06']);
    expect(lines.every((l) => l.role === 'saved_invested')).toBe(true);
    f.usualMonth.saving = { amount: 20000, day: 6, movedThisMonth: false };
    expect(toEngineInputs(f).inputs.months.flatMap((m) => m.lines).filter((l) => l.seriesId === 'saving')).toHaveLength(6);
  });
});

describe('05.4-48: VARIANTS and the decide_shadow_runs variant CHECK', () => {
  it('the newest migration that sets the variant CHECK lists exactly VARIANTS', () => {
    const dir = path.join(__dirname, '../../../../../../supabase/migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const sets = files
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
      .map((sql) => /variant\s+in\s*\(([^)]*)\)/i.exec(sql))
      .filter((m): m is RegExpExecArray => m !== null);
    const last = sets[sets.length - 1];
    if (last === undefined) throw new Error('no migration sets the decide_shadow_runs variant CHECK');
    const listed = [...(last[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual([...VARIANTS].sort());
  });
});
