import type { Evaluation, V3Inputs } from '@/engine/decide/v3';
import en from '@/i18n/locales/en';
import { readoutRows, type ReadoutAnswers, type ReadoutFormat } from '../readoutModel';

function lookup(key: string): string | undefined {
  let cur: unknown = en;
  for (const part of key.split('.')) cur = typeof cur === 'object' && cur !== null ? (cur as Record<string, unknown>)[part] : undefined;
  return typeof cur === 'string' ? cur : undefined;
}

const fmt: ReadoutFormat = {
  money: (m) => `$${(m / 100).toLocaleString('en-US')}`,
  date: (iso) => `d:${iso}`,
  word(key, params = {}) {
    const plural = typeof params.count === 'number' ? (params.count === 1 ? '_one' : '_other') : '';
    const text = lookup(`${key}${plural}`) ?? lookup(key);
    if (text === undefined) throw new Error(`no copy for ${key}`);
    return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params[name]));
  },
};

const answers: ReadoutAnswers = { accountNames: { a1: 'High-interest savings' } };

type Over = Partial<Record<keyof V3Inputs, unknown>>;
const inputsOf = (over: Over = {}): V3Inputs =>
  ({
    months: [],
    profile: null,
    unspent: null,
    emergency: null,
    envelopes: [],
    everydayOverride: null,
    ...over,
  }) as unknown as V3Inputs;

const evalOf = (over: { e?: number | null; missing?: string[]; notices?: unknown[]; funds?: Record<string, unknown> } = {}): Evaluation =>
  ({
    month: { e: over.e ?? null },
    funds: { envelopesSaved: 0, ...(over.funds ?? {}) },
    result: { missing: over.missing ?? [], notices: over.notices ?? [] },
  }) as unknown as Evaluation;

const byId = (rows: ReturnType<typeof readoutRows>) => Object.fromEntries(rows.map((r) => [r.id, r.value]));

describe('readoutRows', () => {
  it('shows only the income profile ("Not set") when there is nothing else to say', () => {
    const rows = readoutRows(inputsOf(), evalOf(), answers, fmt);
    expect(rows).toEqual([{ id: 'income', labelKey: 'decide.setupPage.labelIncome', value: 'Not set' }]);
  });

  it('accounts counted: set of total with the not-set hint', () => {
    const accounts = [
      { id: 'a', balance: 0, use: { kind: 'everyday' } },
      { id: 'b', balance: 0, use: { kind: 'untouched' } },
      { id: 'c', balance: 0, use: null },
    ];
    expect(byId(readoutRows(inputsOf({ accounts }), evalOf(), answers, fmt)).accounts).toBe('2 of 3 · 1 not set up');
    expect(byId(readoutRows(inputsOf({ accounts: accounts.slice(0, 2) }), evalOf(), answers, fmt)).accounts).toBe('2 of 2');
  });

  it('income profile: kinds with the stated pattern', () => {
    const profile = { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'steady' };
    expect(byId(readoutRows(inputsOf({ profile }), evalOf(), answers, fmt)).income).toBe('Salary · steady');
    const two = { ...profile, types: ['commission', 'freelance'], pattern: null };
    expect(byId(readoutRows(inputsOf({ profile: two }), evalOf(), answers, fmt)).income).toBe('Commission or tips, Freelance or self-employed');
  });

  it('pattern and expected income: pattern with confirmed months, or either alone', () => {
    const profile = { types: ['salary'], pattern: 'seasonal' };
    const one = byId(readoutRows(inputsOf({ profile, expectedIncome: [{ month: '2026-12', amount: 1, at: '2026-10-01' }] }), evalOf(), answers, fmt));
    expect(one.pattern).toBe('Seasonal · 1 month confirmed');
    const two = byId(
      readoutRows(
        inputsOf({ profile: { types: ['salary'], pattern: null }, expectedIncome: [{}, {}] }),
        evalOf(),
        answers,
        fmt,
      ),
    );
    expect(two.pattern).toBe('2 months confirmed');
    expect(byId(readoutRows(inputsOf({ profile }), evalOf(), answers, fmt)).pattern).toBe('Seasonal');
  });

  it('typical month: the user figure, else the records figure, else nothing', () => {
    expect(byId(readoutRows(inputsOf({ everydayOverride: 120000 }), evalOf({ e: 90000 }), answers, fmt)).typical).toBe('$1,200 · your figure');
    expect(byId(readoutRows(inputsOf(), evalOf({ e: 90000 }), answers, fmt)).typical).toBe('$900 · from records');
    expect(byId(readoutRows(inputsOf(), evalOf({ e: null }), answers, fmt)).typical).toBeUndefined();
  });

  it('unspent money with its date, and the emergency fund with and without a named account', () => {
    const base = inputsOf({ unspent: { amount: 240000, at: '2026-10-03' }, emergency: { amount: 900000, accountId: 'a1' } });
    const r = byId(readoutRows(base, evalOf(), answers, fmt));
    expect(r.unspent).toBe('$2,400 (d:2026-10-03)');
    expect(r.emergency).toBe('$9,000 · High-interest savings');
    const bare = byId(readoutRows(inputsOf({ emergency: { amount: 900000 } }), evalOf(), answers, fmt));
    expect(bare.emergency).toBe('$9,000');
  });

  it('envelopes: count, saved and how many are placed in an account', () => {
    const envelopes = [
      { id: 'e1', saved: 100000, accountId: 'a1' },
      { id: 'e2', saved: 150000, accountId: null },
      { id: 'e3', saved: 0 },
    ];
    const r = byId(readoutRows(inputsOf({ envelopes }), evalOf({ funds: { envelopesSaved: 250000 } }), answers, fmt));
    expect(r.envelopes).toBe('3 · $2,500 saved · 1 placed in an account');
  });

  it('held back for plans is the sum of the bridges; absent without any', () => {
    const r = byId(readoutRows(inputsOf({ heldBridges: [{ id: 'x', amount: 10000 }, { id: 'y', amount: 5000 }] }), evalOf(), answers, fmt));
    expect(r.held).toBe('$150');
    expect(byId(readoutRows(inputsOf({ heldBridges: [] }), evalOf(), answers, fmt)).held).toBeUndefined();
  });

  it('refunds linked counts lines with a refundOf; absent when none', () => {
    const months = [
      { month: '2026-09', full: true, mark: null, lines: [{ refundOf: 'p1' }, { refundOf: null }, {}] },
      { month: '2026-10', full: false, mark: null, lines: [{ refundOf: 'p2' }] },
    ];
    expect(byId(readoutRows(inputsOf({ months }), evalOf(), answers, fmt)).refunds).toBe('2');
    expect(byId(readoutRows(inputsOf(), evalOf(), answers, fmt)).refunds).toBeUndefined();
  });

  it('pay arrivals: pending count, else the arrived count, else nothing', () => {
    const pending = [
      { seriesId: 's', date: '2026-10-01', arrived: false },
      { seriesId: 's', date: '2026-09-01', arrived: true },
    ];
    expect(byId(readoutRows(inputsOf({ payArrivals: pending }), evalOf(), answers, fmt)).arrivals).toBe('1 pending');
    expect(byId(readoutRows(inputsOf({ payArrivals: [pending[1]] }), evalOf(), answers, fmt)).arrivals).toBe('1 arrived');
    expect(byId(readoutRows(inputsOf(), evalOf(), answers, fmt)).arrivals).toBeUndefined();
  });

  describe('next question', () => {
    it('is the first setup question in the engine order, as its existing copy', () => {
      const e = evalOf({
        missing: ['no_price', 'pay_arrival_question', 'everyday_unknown'],
        notices: [{ code: 'pay_not_seen', values: { amount: 250000, date: '2026-10-01' } }],
      });
      expect(byId(readoutRows(inputsOf(), e, answers, fmt)).next).toBe('Did your pay of $2,500, due on d:2026-10-01, arrive?');
    });

    it('names the account for the account question, and asks for the fund account when it is unlinked', () => {
      const named = evalOf({
        missing: ['account_use_question'],
        funds: { unstatedAccounts: ['a1'] },
        notices: [{ code: 'account_use_unknown', values: { accountId: 'a1', count: 1 } }],
      });
      expect(byId(readoutRows(inputsOf(), named, answers, fmt)).next).toContain('What is High-interest savings for');
      const fund = evalOf({ missing: ['account_use_question'], funds: { fundUnlinked: true } });
      expect(byId(readoutRows(inputsOf(), fund, answers, fmt)).next).toBe('Which account holds your emergency fund?');
    });

    it('is left out when the engine asks only about one purchase, or nothing', () => {
      expect(byId(readoutRows(inputsOf(), evalOf({ missing: ['no_price', 'plan_count_missing'] }), answers, fmt)).next).toBeUndefined();
      expect(byId(readoutRows(inputsOf(), evalOf(), answers, fmt)).next).toBeUndefined();
    });
  });

  it('keeps the UI-SPEC order', () => {
    const rows = readoutRows(
      inputsOf({
        accounts: [{ id: 'a', balance: 0, use: null }],
        profile: { types: ['salary'], pattern: 'steady' },
        everydayOverride: 1,
        unspent: { amount: 1, at: '2026-10-03' },
        emergency: { amount: 1 },
        envelopes: [{ id: 'e', saved: 1 }],
        heldBridges: [{ id: 'h', amount: 1 }],
        months: [{ month: '2026-10', full: false, mark: null, lines: [{ refundOf: 'p' }] }],
        payArrivals: [{ seriesId: 's', date: '2026-10-01', arrived: false }],
      }),
      evalOf({ missing: ['everyday_unknown'] }),
      answers,
      fmt,
    );
    expect(rows.map((r) => r.id)).toEqual(['accounts', 'income', 'pattern', 'typical', 'unspent', 'emergency', 'envelopes', 'held', 'refunds', 'arrivals', 'next']);
  });
});
