/**
 * 06.1-06 (D-18, UX-19, UX-21): the production Result-to-sentences renderer. Every engine code reads as one sentence from its own
 * copy key with every placeholder filled; a gap throws MissingCopyError rather than printing a code.
 */
import en from '@/i18n/locales/en';
import { SAMPLE_VALUES, nodeAt } from '@/i18n/__tests__/wordingScope';
import {
  AFTER_BUY_KEYS,
  BASIS_KEYS,
  BASIS_REASON_KEYS,
  CAVEAT_FIGURE_KEYS,
  CAVEAT_KEYS,
  CAVEAT_VALUE_KEYS,
  CAVEAT_WRONG_FIGURE_KEY,
  FACT_KEYS,
  FACT_VALUE_KEYS,
  MISSING_KEYS,
  NEXT_STEP_KEYS,
  NOTICE_KEYS,
  NOTICE_VALUE_KEYS,
  READINESS_KEYS,
  type Caveat,
  type CaveatCode,
  type CodeValues,
  type Fact,
  type FactCode,
  type MissingCode,
  type Notice,
  type NoticeCode,
  type Result,
  type V3Inputs,
} from '@/engine/decide/v3';
import { sayLine } from '@/engine/decide/v3/__tests__/reviewed/page';
import { MissingCopyError, copyKeyFor, sayCode, sayResult, type Line, type SayDeps } from '../sayResult';

// ------------------------------------------------------------------ the real en resources, filled in one pass

const template = (key: string): string | null => {
  const node = nodeAt(en, key);
  return typeof node === 'string' ? node : null;
};
const t = (key: string, values?: Readonly<Record<string, string>>): string => {
  const raw = template(key);
  if (raw === null) return key;
  if (values === undefined) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (m, k: string) => values[k] ?? m);
};
const money = (minor: number, currency: string): string => {
  const abs = Math.abs(minor);
  return `${minor < 0 ? '-' : ''}${currency === 'USD' ? '$' : `${currency} `}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ID = '3f2b8c1e-9d4a-4f6b-8e2c-1a7d5b9c0e3f';

const deps: SayDeps = {
  t,
  exists: (key) => template(key) !== null,
  money,
  date: (d) => `<${d}>`,
  currency: 'USD',
  today: '2026-11-10',
  names: {
    category: () => 'Groceries',
    series: () => 'Car insurance',
    account: () => 'Everyday',
    debt: () => 'Visa card',
    envelope: () => 'Holiday',
    figure: () => 'your everyday spending',
  },
};

// ------------------------------------------------------------------ engine-shaped samples for every value key

const RESOLVER_IDS = new Set(['categoryId', 'seriesId', 'envelopeId', 'accountId', 'debtId']);
const DATE_KEYS = new Set(['date', 'dueDate', 'readyBy']);
const MONTH_KEYS = new Set(['month', 'from', 'to', 'leanFrom', 'leanTo', 'until', 'lastYear', 'sameMonth']);
const TEXT_KEYS = new Set(['apr', 'percent', 'rate', 'currency', 'name']);

/** The discriminator values each code can carry; one sample is built per value. */
const DISCRIMINATED: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  line_crossed: { unit: ['percent', 'money', 'tenths'] },
  save_vs_borrow: { kind: ['ready', 'cash_fits', 'no_date', 'with_net', 'with_overdraft', 'ask'] },
  ask_debts_not_recorded: { kind: ['all', 'loan', 'card', 'overdraft', 'loan_card', 'loan_overdraft', 'card_overdraft'] },
  tight_floor: { basis: ['tenth', 'user_line'] },
  earlier_money_from: { where: ['account', 'savings'] },
  lean_bridge: { source: ['savings', 'net'] },
  income_from_expected: { source: ['confirmed', 'last_year', 'low'] },
};

function sampleValue(code: string, key: string): string | number {
  if (RESOLVER_IDS.has(key)) return ID;
  if (key === 'missing') return 'everyday_unknown';
  if (key === 'account' && (code === 'account_no_rate' || code === 'shared_money')) return ID;
  if (key === 'lineId') return ID;
  if (key === 'kind') return 'housing_share';
  if (key === 'basis') return 'state';
  if (key === 'country') return 'GB';
  if (key === 'gap' && code === 'pay_gap') return '6.2';
  if (key === 'zero') return 0;
  if (DATE_KEYS.has(key)) return '2026-12-15';
  if (MONTH_KEYS.has(key)) return '2026-11';
  if (TEXT_KEYS.has(key)) return SAMPLE_VALUES[key] as string;
  return 12345;
}

function samplesOf(code: string, keys: readonly string[]): CodeValues[] {
  const base: Record<string, string | number> = {};
  for (const k of keys) base[k] = sampleValue(code, k);
  const out: CodeValues[] = [base];
  for (const [k, options] of Object.entries(DISCRIMINATED[code] ?? {})) for (const o of options) out.push({ ...base, [k]: o });
  return out;
}

const without = (v: CodeValues, ...keys: string[]): CodeValues => Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k)));

/** The value-shape variants: a key left out, or a 0, picks its own copy. */
function shapeVariants(code: string, v: CodeValues): CodeValues[] {
  switch (code) {
    case 'wait_keeps_net':
      return [without(v, 'date')];
    case 'overdraft_without_purchase':
      return [{ ...v, days: 0 }];
    case 'overdraft_not_cleared':
      return [without(v, 'date')];
    case 'overdraft_use':
    case 'overdraft_repeat':
      return [without(v, 'rate', 'cost')];
    case 'other_account_overdrawn':
      return [without(v, 'rate', 'monthlyCost')];
    case 'month_heading_short':
      return [without(v, 'categoryId', 'largest')];
    default:
      return [];
  }
}

const FACT_SAMPLES: Fact[] = (Object.keys(FACT_VALUE_KEYS) as FactCode[]).flatMap((code) => {
  const all = samplesOf(code, FACT_VALUE_KEYS[code]);
  return [...all, ...shapeVariants(code, all[0] as CodeValues)].map((values) => ({ code, values }));
});
const NOTICE_SAMPLES: Notice[] = (Object.keys(NOTICE_VALUE_KEYS) as NoticeCode[]).flatMap((code) => {
  const all = samplesOf(code, NOTICE_VALUE_KEYS[code]);
  return [...all, ...shapeVariants(code, all[0] as CodeValues)].map((values) => ({ code, values }));
});
const CAVEAT_SAMPLES: Caveat[] = (Object.keys(CAVEAT_VALUE_KEYS) as CaveatCode[]).map((code) => ({
  code,
  values: samplesOf(code, CAVEAT_VALUE_KEYS[code])[0] as CodeValues,
}));

function result(over: Partial<Result> = {}): Result {
  return {
    code: 'fits_month',
    variant: null,
    legacyState: 'fits',
    split: [],
    facts: [],
    notices: [],
    missing: [],
    reasons: [],
    readyBy: null,
    band: null,
    layers: [],
    confidence: { reasons: [], basis: { kind: 'records', months: 6, upTo: '2026-11-09' }, nextStep: null },
    parts: { oneOff: 'fits_month', monthly: null },
    afterBuy: { lead: 'month', month: 31000, usualMonth: null, before: 40000, monthName: '2026-11' },
    purchaseDate: '2026-11-10',
    caveats: [],
    ...over,
  };
}

const texts = (lines: readonly (Line | null)[]): string[] => lines.filter((l): l is Line => l !== null).map((l) => l.text);

function allTexts(r: Result): string[] {
  const s = sayResult(r, deps);
  return [
    ...texts(s.notices),
    ...texts(s.facts),
    ...texts([s.basis, s.caveat, s.nextStep, s.afterBuy.lead, s.afterBuy.boughtOn]),
    ...texts(s.caveatFigures),
    ...texts(s.missing),
    ...texts(s.readiness),
  ];
}

// ------------------------------------------------------------------ Test 1: every code, every value key

describe('sayResult: every engine code reads as one filled sentence (D-18, UX-19)', () => {
  it.each(FACT_SAMPLES.map((f) => [f.code, JSON.stringify(f.values), f] as const))('fact %s %s', (_c, _v, f) => {
    const line = sayCode('fact', f, deps);
    expect(line.text.length).toBeGreaterThan(0);
    expect(line.text).not.toContain('{{');
    expect(line.text).not.toMatch(UUID);
    expect(line.text).not.toContain(f.code);
    expect(line.key.startsWith(FACT_KEYS[f.code])).toBe(true);
    expect(line.code).toBe(f.code);
  });

  it.each(NOTICE_SAMPLES.map((n) => [n.code, JSON.stringify(n.values), n] as const))('notice %s %s', (_c, _v, n) => {
    const line = sayCode('notice', n, deps);
    expect(line.text.length).toBeGreaterThan(0);
    expect(line.text).not.toContain('{{');
    expect(line.text).not.toMatch(UUID);
    expect(line.key.startsWith(NOTICE_KEYS[n.code])).toBe(true);
  });

  it.each(CAVEAT_SAMPLES.map((c) => [c.code, c] as const))('caveat %s', (_c, c) => {
    const s = sayResult(result({ caveats: [c] }), deps);
    expect(s.caveat?.key).toBe(CAVEAT_KEYS[c.code]);
    expect(s.caveat?.text).not.toContain('{{');
    expect(s.caveat?.text).not.toMatch(UUID);
  });

  it('every FACT_VALUE_KEYS, NOTICE_VALUE_KEYS and CAVEAT_VALUE_KEYS code is sampled', () => {
    expect(new Set(FACT_SAMPLES.map((f) => f.code))).toEqual(new Set(Object.keys(FACT_VALUE_KEYS)));
    expect(new Set(NOTICE_SAMPLES.map((n) => n.code))).toEqual(new Set(Object.keys(NOTICE_VALUE_KEYS)));
    expect(new Set(CAVEAT_SAMPLES.map((c) => c.code))).toEqual(new Set(Object.keys(CAVEAT_VALUE_KEYS)));
  });

  it('every `_variant` copy of a fact or notice is reached by some sample', () => {
    const reached = new Set([...FACT_SAMPLES.map((f) => sayCode('fact', f, deps).key), ...NOTICE_SAMPLES.map((n) => sayCode('notice', n, deps).key)]);
    const factCodes = Object.keys(FACT_KEYS);
    const noticeCodes = Object.keys(NOTICE_KEYS);
    const copy = (en as unknown as { decide: { v3: { fact: Record<string, string>; notice: Record<string, string> } } }).decide.v3;
    const want = [
      ...Object.keys(copy.fact).filter((k) => !factCodes.includes(k)).map((k) => `decide.v3.fact.${k}`),
      ...Object.keys(copy.notice).filter((k) => !noticeCodes.includes(k)).map((k) => `decide.v3.notice.${k}`),
    ];
    expect(want.filter((k) => !reached.has(k))).toEqual([]);
  });

  it('numbers become money unless plain; dates and months go through deps.date; at_todays_rate names the currency (FIN-24)', () => {
    expect(sayCode('fact', { code: 'net_refill', values: { months: 4 } }, deps).text).toBe('Refilled in about 4 months from spare money.');
    expect(sayCode('fact', { code: 'net_used', values: { used: 50000 } }, deps).text).toBe('Uses $500.00 of your safety net.');
    expect(sayCode('fact', { code: 'sale_counted', values: { amount: 1000, date: '2026-12-01' } }, deps).text).toBe('This counts $10.00 from the sale on <2026-12-01>.');
    expect(sayCode('fact', { code: 'at_todays_rate', values: { currency: 'EUR' } }, deps).text).toBe('Converted from EUR at today’s rate.');
    expect(sayCode('fact', { code: 'line_crossed', values: { lineId: ID, kind: 'single_purchase_cap', unit: 'money', value: 90000, limit: 50000 } }, deps).text).toBe(
      'This brings it to $900.00; your line is $500.00.'
    );
    expect(sayCode('fact', { code: 'line_crossed', values: { lineId: ID, kind: 'housing_share', unit: 'percent', value: 40, limit: 35 } }, deps).text).toBe(
      'This brings it to 40% of your income; your line is 35%.'
    );
    expect(sayCode('fact', { code: 'clearing_first', values: { zero: 0 } }, deps).text).toContain('below $0.00 costs');
  });

  it('ids become names, never raw ids (T-06.1-06-02)', () => {
    expect(sayCode('fact', { code: 'yearly_bill_ahead', values: { seriesId: ID, amount: 100, dueDate: '2027-03-01' } }, deps).text).toBe('Car insurance of $1.00 is due on <2027-03-01>.');
    expect(sayCode('fact', { code: 'debt_due_day_assumed', values: { debtId: ID, amount: 100 } }, deps).text).toContain('Your Visa card minimum');
    expect(sayCode('fact', { code: 'envelope_used', values: { used: 100, envelopeId: ID } }, deps).text).toContain('the Holiday envelope');
    expect(sayCode('fact', { code: 'save_vs_borrow', values: { kind: 'ask', missing: 'everyday_unknown' } }, deps).text).toBe('To compare with saving up, add your everyday spending.');
    expect(sayCode('notice', { code: 'account_no_rate', values: { account: ID } }, deps).text).toBe('No exchange rate for Everyday, so it is left out.');
    expect(sayCode('notice', { code: 'month_heading_short', values: { month: '2026-11', short: 100, categoryId: ID, largest: 50 } }, deps).text).toContain('mostly Groceries');
  });

  it('a user name holding {{...}} is printed as typed, never filled again (T-06.1-06-03)', () => {
    const d: SayDeps = { ...deps, names: { ...deps.names, series: () => '{{amount}}' } };
    expect(sayCode('fact', { code: 'yearly_bill_ahead', values: { seriesId: ID, amount: 100, dueDate: '2027-03-01' } }, d).text).toBe('{{amount}} of $1.00 is due on <2027-03-01>.');
  });
});

// ------------------------------------------------------------------ order, caveats, basis, after-buy

describe('sayResult: the Result in reading order', () => {
  it('notices put unsaved_changes first (CO-D-113); facts keep the engine order (FIN-01..FIN-15, CO-D-35)', () => {
    const facts: Fact[] = [
      { code: 'net_used', values: { used: 100 } },
      { code: 'net_left', values: { left: 200 } },
      { code: 'free_help', values: { country: 'GB', name: 'MoneyHelper' } },
    ];
    const notices: Notice[] = [
      { code: 'emergency_not_set', values: {} },
      { code: 'unsaved_changes', values: {} },
      { code: 'from_your_figures', values: {} },
    ];
    const s = sayResult(result({ facts, notices }), deps);
    expect(s.notices.map((l) => l.code)).toEqual(['unsaved_changes', 'emergency_not_set', 'from_your_figures']);
    expect(s.facts.map((l) => l.code)).toEqual(['net_used', 'net_left', 'free_help']);
    expect(s.facts[2]?.text).toBe('MoneyHelper gives money help at no cost.');
  });

  it('Test 2: two caveats render only the first (CO-D-119)', () => {
    const s = sayResult(result({ caveats: [{ code: 'your_word', values: {} }, { code: 'close_to_line', values: {} }] }), deps);
    expect(s.caveat?.code).toBe('your_word');
    expect(s.caveatFigures).toEqual([]);
  });

  it('Test 2: large_for_month lists its figures, then the wrong-figure line (CO-D-118)', () => {
    const s = sayResult(result({ caveats: [{ code: 'large_for_month', values: { moneyIn: 280000, costs: 235000, used: 50000, price: 90000 } }, { code: 'your_word', values: {} }] }), deps);
    expect(s.caveat?.key).toBe(CAVEAT_KEYS.large_for_month);
    expect(s.caveatFigures.map((l) => l.key)).toEqual([CAVEAT_FIGURE_KEYS.moneyIn, CAVEAT_FIGURE_KEYS.costs, CAVEAT_FIGURE_KEYS.used, CAVEAT_FIGURE_KEYS.price, CAVEAT_WRONG_FIGURE_KEY]);
    expect(s.caveatFigures[0]?.text).toBe('Usual money in: $2800.00 a month.');
  });

  it('large_for_month without costs leaves the costs figure out', () => {
    const s = sayResult(result({ caveats: [{ code: 'large_for_month', values: { moneyIn: 280000, used: 50000, price: 90000 } }] }), deps);
    expect(s.caveatFigures.map((l) => l.key)).toEqual([CAVEAT_FIGURE_KEYS.moneyIn, CAVEAT_FIGURE_KEYS.used, CAVEAT_FIGURE_KEYS.price, CAVEAT_WRONG_FIGURE_KEY]);
  });

  it('no caveats (or a result built outside prepare) gives no caveat', () => {
    const { caveats: _drop, ...bare } = result();
    expect(sayResult(bare as Result, deps).caveat).toBeNull();
    expect(sayResult(result({ caveats: [] }), deps).caveat).toBeNull();
  });

  it('basis reads every kind; records_with_reason reads its reason', () => {
    const basis = (b: Result['confidence']['basis']): Line | null => sayResult(result({ confidence: { reasons: [], basis, nextStep: null } }), deps).basis;
    expect(basis({ kind: 'records', months: 6, upTo: '2026-11-09' })).toEqual({ key: BASIS_KEYS.records, code: 'records', text: 'Based on 6 months of your records, up to <2026-11-09>.' });
    expect(basis({ kind: 'partial', used: 2, lookedFor: 3, upTo: '2026-11-09' })?.text).toBe('Based on 2 of the 3 months of records Decide looks for.');
    expect(basis({ kind: 'quick_estimates' })?.key).toBe(BASIS_KEYS.quick_estimates);
    expect(basis({ kind: 'records_with_reason', months: 6, upTo: '2026-11-09', reason: 'close_to_line' })?.key).toBe(BASIS_REASON_KEYS.close_to_line);
    expect(() => basis({ kind: 'records_with_reason', months: 6, upTo: '2026-11-09', reason: 'few_months' })).toThrow(MissingCopyError);
  });

  it('next step, missing and readiness lines', () => {
    const s = sayResult(
      result({
        code: 'needs_input',
        confidence: { reasons: [], basis: { kind: 'quick_estimates' }, nextStep: { reason: 'few_months', step: 'add_records' } },
        missing: ['no_price', 'pay_arrival_question', 'volatile_cover_question'],
        notices: [
          { code: 'pay_not_seen', values: { amount: 280000, date: '2026-11-01' } },
          { code: 'income_volatile', values: { payment: 8500, periods: 12, monthly: 8500, months: 12, leanFrom: '2026-01', leanTo: '2026-03', leanLeft: 6000 } },
        ],
        readiness: { ready: false, missing: ['past_month_missing', 'envelopes_unconfirmed'] },
      }),
      deps
    );
    expect(s.nextStep).toEqual({ key: NEXT_STEP_KEYS.add_records, code: 'add_records', text: 'More months of records give this more to go on.' });
    expect(s.missing.map((l) => l.key)).toEqual([MISSING_KEYS.no_price, MISSING_KEYS.pay_arrival_question, MISSING_KEYS.volatile_cover_question]);
    expect(s.missing[1]?.text).toBe('Did your pay of $2800.00, due on <2026-11-01>, arrive?');
    expect(s.missing[2]?.text).toBe('Can you cover $85.00 a month for 12 months, even in your low months?');
    expect(s.readiness.map((l) => l.key)).toEqual([READINESS_KEYS.past_month_missing, READINESS_KEYS.envelopes_unconfirmed]);
    expect(s.afterBuy.lead).toBeNull();
  });

  it('account_use_question reads the account name, or the fund copy when only the safety net is unlinked', () => {
    const ask = (notices: Notice[]): Line | undefined => sayResult(result({ code: 'needs_input', missing: ['account_use_question'], notices }), deps).missing[0];
    expect(ask([{ code: 'account_use_unknown', values: { accountId: ID, count: 1 } }])?.text).toContain('What is Everyday for');
    expect(ask([{ code: 'fund_account_unknown', values: { amount: 100 } }])?.key).toBe(`${MISSING_KEYS.account_use_question}_fund`);
    expect(ask([{ code: 'fund_account_unknown', values: { amount: 100 } }, { code: 'account_use_unknown', values: { accountId: ID, count: 1 } }])?.key).toBe(MISSING_KEYS.account_use_question);
  });

  it('a question whose notice is absent has nothing to fill and throws', () => {
    expect(() => sayResult(result({ code: 'needs_input', missing: ['unexplained_money_question'] }), deps)).toThrow(MissingCopyError);
  });

  it('a ready result with no readiness block has no readiness lines', () => {
    expect(sayResult(result({ readiness: { ready: true, missing: [] } }), deps).readiness).toEqual([]);
    expect(sayResult(result(), deps).readiness).toEqual([]);
  });

  it('after-buy: this month leads a one-off; a plan leads with the usual month; below 0 reads short (D-116)', () => {
    const lead = (afterBuy: Result['afterBuy']): Line | null => sayResult(result({ afterBuy }), deps).afterBuy.lead;
    expect(lead({ lead: 'month', month: 31000, usualMonth: null, before: 40000, monthName: '2026-11' })?.text).toBe('<2026-11> would still leave about $310.00.');
    expect(lead({ lead: 'month', month: -15000, usualMonth: null, before: 40000, monthName: '2026-11' })?.text).toBe('<2026-11> would be about $150.00 short.');
    expect(lead({ lead: 'usualMonth', month: 0, usualMonth: 12000, before: 0, monthName: '2026-11' })?.key).toBe(AFTER_BUY_KEYS.usualMonth);
    expect(lead({ lead: 'usualMonth', month: 0, usualMonth: -12000, before: 0, monthName: '2026-11' })?.text).toBe('A usual month would be about $120.00 short once payments start.');
    expect(lead({ lead: 'usualMonth', month: 500, usualMonth: null, before: 0, monthName: '2026-11' })?.key).toBe(AFTER_BUY_KEYS.month);
  });

  it('bought today or on the purchase date (D-42)', () => {
    expect(sayResult(result(), deps).afterBuy.boughtOn?.key).toBe(AFTER_BUY_KEYS.boughtToday);
    expect(sayResult(result({ purchaseDate: '2026-12-24' }), deps).afterBuy.boughtOn?.text).toBe('Bought on <2026-12-24>.');
  });
});

// ------------------------------------------------------------------ Test 3: gaps throw, never print a code

describe('sayResult: a gap is an error, never a printed code (T-06.1-06-01)', () => {
  it('Test 3: a code with no key throws MissingCopyError', () => {
    expect(() => sayCode('fact', { code: 'not_a_code' as FactCode, values: {} }, deps)).toThrow(MissingCopyError);
    expect(() => sayCode('notice', { code: 'not_a_code' as NoticeCode, values: {} }, deps)).toThrow(MissingCopyError);
    expect(() => sayResult(result({ missing: ['not_a_code' as MissingCode] }), deps)).toThrow(MissingCopyError);
  });

  it('a key with no copy throws', () => {
    expect(() => sayCode('fact', { code: 'net_used', values: { used: 1 } }, { ...deps, exists: () => false })).toThrow(MissingCopyError);
  });

  it('an unfilled placeholder throws and names the placeholder', () => {
    let err: unknown = null;
    try {
      sayCode('fact', { code: 'net_used', values: {} }, deps);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MissingCopyError);
    expect((err as MissingCopyError).code).toBe('net_used');
    expect((err as MissingCopyError).key).toBe(FACT_KEYS.net_used);
    expect((err as MissingCopyError).message).toContain('{{used}}');
    expect(() => sayCode('fact', { code: 'net_used', values: { used: null } }, deps)).toThrow(MissingCopyError);
  });

  it('with onMissing set, the line is dropped and reported, and the rest still renders', () => {
    const seen: string[] = [];
    const d: SayDeps = { ...deps, onMissing: (e) => seen.push(e.code) };
    const s = sayResult(
      result({
        facts: [{ code: 'net_used', values: {} }, { code: 'net_left', values: { left: 1 } }],
        caveats: [{ code: 'few_months', values: {} }],
        confidence: { reasons: [], basis: { kind: 'records_with_reason', months: 1, upTo: '2026-11-01', reason: 'few_months' }, nextStep: null },
        missing: ['unexplained_money_question'],
      }),
      d
    );
    expect(s.facts.map((l) => l.code)).toEqual(['net_left']);
    expect(s.caveat).toBeNull();
    expect(s.basis).toBeNull();
    expect(s.missing).toEqual([]);
    expect(seen).toEqual(['net_used', 'records_with_reason', 'few_months', 'unexplained_money_question']);
  });

  it('a non-MissingCopyError from a dependency is never swallowed', () => {
    const d: SayDeps = { ...deps, onMissing: () => undefined, money: () => { throw new RangeError('boom'); } };
    expect(() => sayResult(result({ facts: [{ code: 'net_used', values: { used: 1 } }] }), d)).toThrow(RangeError);
  });
});

// ------------------------------------------------------------------ Test 4: no household words outside household codes (D-03, UX-21)

describe('sayResult: no household branch (D-03 / UX-21)', () => {
  it('Test 4: no non-household line says household, partner or shared', () => {
    const facts = FACT_SAMPLES;
    const notices = NOTICE_SAMPLES;
    const out = [
      ...facts.map((f) => sayCode('fact', f, deps).text),
      ...notices.map((n) => sayCode('notice', n, deps).text),
      ...CAVEAT_SAMPLES.filter((c) => c.code !== 'shared_money').flatMap((c) => allTexts(result({ caveats: [c] }))),
    ];
    expect(out.filter((s) => /household|partner|shared/i.test(s))).toEqual([]);
  });

  it('shared_money renders through the same generic caveat path, naming the account', () => {
    expect(sayResult(result({ caveats: [{ code: 'shared_money', values: { account: ID } }] }), deps).caveat?.text).toBe('Money in Everyday may be planned by someone else too.');
  });
});

// ------------------------------------------------------------------ parity with the reviewed page's copyKeyFor

/** The variant keys whose filled template could have produced `said`. */
function keysMatching(group: 'fact' | 'notice', code: string, said: string): string[] {
  const table = (en as unknown as { decide: { v3: Record<string, Record<string, string>> } }).decide.v3[group] as Record<string, string>;
  const codes = Object.keys(group === 'fact' ? FACT_KEYS : NOTICE_KEYS);
  const body = said.replace(/ \(\w+ \{.*\}\)$/, '');
  return Object.entries(table)
    .filter(([k]) => k === code || (k.startsWith(`${code}_`) && !codes.includes(k)))
    .filter(([, text]) => new RegExp(`^${text.split(/\{\{\w+\}\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*?')}$`, 's').test(body))
    .map(([k]) => `decide.v3.${group}.${k}`);
}

/** Codes whose variant the reviewed page does not pick yet (it predates these discriminators); sayResult reads them from the engine's comments. */
const BEYOND_PAGE = new Set(['ask_debts_not_recorded', 'tight_floor', 'earlier_money_from', 'lean_bridge']);

describe('copyKeyFor picks the same key as the reviewed page (06.1-06)', () => {
  const inputs = { currency: 'USD', series: [] } as unknown as V3Inputs;
  it.each([...FACT_SAMPLES.map((f) => ['fact', f] as const), ...NOTICE_SAMPLES.map((n) => ['notice', n] as const)].filter(([, i]) => !BEYOND_PAGE.has(i.code)).map(([g, i]) => [g, i.code, JSON.stringify(i.values), i] as const))(
    '%s %s %s',
    (group, code, _v, item) => {
      const said = sayLine(group, item, inputs);
      expect(keysMatching(group, code, said)).toContain(copyKeyFor(group, code, item.values, deps.exists));
    }
  );

  it('beyond the page: the discriminators it predates still pick their variant', () => {
    expect(copyKeyFor('fact', 'ask_debts_not_recorded', { kind: 'loan_card' }, deps.exists)).toBe('decide.v3.fact.ask_debts_not_recorded_loan_card');
    expect(copyKeyFor('fact', 'ask_debts_not_recorded', { kind: 'all' }, deps.exists)).toBe('decide.v3.fact.ask_debts_not_recorded');
    expect(copyKeyFor('fact', 'tight_floor', { basis: 'user_line' }, deps.exists)).toBe('decide.v3.fact.tight_floor_user_line');
    expect(copyKeyFor('fact', 'earlier_money_from', { where: 'savings' }, deps.exists)).toBe('decide.v3.fact.earlier_money_from_savings');
    expect(copyKeyFor('fact', 'lean_bridge', { source: 'net' }, deps.exists)).toBe('decide.v3.fact.lean_bridge_net');
    expect(copyKeyFor('fact', 'not_a_code', {}, deps.exists)).toBeNull();
  });
});
