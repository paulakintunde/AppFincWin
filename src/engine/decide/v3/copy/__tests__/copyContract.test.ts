/**
 * M-03 (05.1-40): the value keys a fact or notice emits and the placeholders in its en.ts copy agree in both
 * directions. A mismatch would show a user "{{worked}}" or an internal number, so the engine's emitted keys are
 * collected from a corpus of real evaluations and held against the declared key table and the copy.
 */
import en from '../../../../../i18n/locales/en';
import { minorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { MISSING_PRIORITY } from '../../constants';
import { evaluate } from '../../evaluate';
import type { CheckV2, CustomOptions, FactCode, LimitLine, MissingCode, NoticeCode, V3Inputs, V3Month } from '../../types';
import extraFile from '../../__tests__/golden/extra-d18.json';
import scenariosFile from '../../__tests__/golden/scenarios22.json';
import {
  loadPersons,
  resolveScenarioPerson,
  toCheckV2,
  toV3Inputs,
  personById,
  type FixtureScenario,
} from '../../__tests__/golden/adapter';
import { checkOnce, checkPlan, inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import {
  COPY_RESOLVERS,
  DISCRIMINATOR_KEYS,
  FACT_KEYS,
  FACT_VALUE_KEYS,
  MISSING_KEYS,
  MISSING_VALUE_SOURCE,
  NOTICE_KEYS,
  NOTICE_VALUE_KEYS,
  READINESS_KEYS,
} from '../verdictTable';

const mu = minorUnits;

/** Codes whose emitter has not landed yet. Each owning plan removes its codes (05.1-43, -46, -50); the list ends empty. emergency_used left in 05.1-44 (D-63): golden #11 Leo, an emergency-marked work purchase, is in the corpus and emits it. */
const NOT_YET_EMITTED: readonly string[] = [
  'lean_bridge',
  'unspent_held_back',
  'lean_months_judged',
  'low_month_judged',
  'income_volatile',
  'rests_on_your_answer',
  'envelope_location_assumed',
  'unexplained_money',
  'account_use_unknown',
  'pay_not_seen',
  'pay_counted_missed',
  'fund_account_unknown',
];

interface Emitted {
  readonly group: 'fact' | 'notice';
  readonly code: string;
  readonly values: Readonly<Record<string, number | string | null>>;
}

type Scenario = FixtureScenario;
const SCENARIOS = [
  ...(scenariosFile as unknown as { scenarios: Scenario[] }).scenarios,
  ...(extraFile as unknown as { scenarios: Scenario[] }).scenarios,
];
const OWN_PET: CustomOptions = {
  itemTypes: [{ id: 'pet', base: 'general', questionIds: [], ownQuestions: [{ id: 'food', label: 'Food', cadence: 'monthly', cash: true }] }],
  purposes: [],
  cadences: [],
  incomeKinds: [],
};

function collect(into: Emitted[], inputs: V3Inputs, check: CheckV2): void {
  const ev = evaluate(inputs, check);
  for (const f of ev.result.facts) into.push({ group: 'fact', code: f.code, values: f.values });
  for (const n of ev.result.notices) into.push({ group: 'notice', code: n.code, values: n.values });
}

function withOctLines(base: V3Inputs, lines: ReturnType<typeof v3Line>[]): V3Inputs {
  return { ...base, months: base.months.map((m): V3Month => (m.month === '2026-10' ? { ...m, lines: [...m.lines, ...lines] } : m)) };
}

function buildCorpus(): Emitted[] {
  const out: Emitted[] = [];

  // 1. Every golden scenario as written.
  for (const s of SCENARIOS) {
    const own = s.id === '22';
    const over: Partial<V3Inputs> = own ? { custom: OWN_PET } : s.id === '14' ? { balance: mu(300000) } : {};
    const check = toCheckV2(s.purchase);
    collect(out, toV3Inputs(resolveScenarioPerson(s), over), own ? { ...check, itemType: { kind: 'custom', id: 'pet' } } : check);
  }

  // 2. Every golden person across a fixed price ladder, once and as a 12-month plan.
  for (const person of loadPersons()) {
    const base = toV3Inputs(person);
    const tl = evaluate(base, checkOnce(100)).month.typicalLeft;
    const unit = tl !== null && tl > 0 ? tl : 50_000;
    for (const pct of [1, 50, 100, 300]) {
      const price = Math.max(100, Math.round((unit * pct) / 100));
      collect(out, base, checkOnce(price));
      collect(out, base, checkPlan(price, { count: 12, apr: percent('0'), firstPayment: { kind: 'one_period' } }));
    }
  }

  // 3. Targeted fixtures for the codes the ladder does not force.
  const sam = toV3Inputs(personById('sam'));
  const own = (id: string, spec: LimitLine['spec']): LimitLine => ({ id, on: true, source: 'own', spec });
  const lines = (...l: LimitLine[]): V3Inputs => ({ ...sam, limits: { lines: l } });
  // line_crossed, one line of each unit
  collect(out, lines(own('cap', { kind: 'single_purchase_cap', cap: mu(1) })), checkOnce(50_000));
  collect(out, lines(own('floor', { kind: 'unspent_floor', floor: mu(99_999_999) })), checkOnce(50_000));
  collect(
    out,
    lines(own('share', { kind: 'category_income_share', categoryId: 'food', pct: percent('0.01') })),
    checkPlan(120_000, { count: 12, apr: percent('0'), firstPayment: { kind: 'one_period' } }, { categoryId: 'food' })
  );
  collect(
    out,
    lines(own('multiple', { kind: 'unsecured_multiple', times: 0 })),
    checkPlan(600_000, { count: 12, apr: percent('10'), firstPayment: { kind: 'one_period' } })
  );
  // quoted_differs, implied_rate, deferred_interest_term, at_todays_rate
  collect(out, sam, checkPlan(204_000, { count: 24, apr: percent('0'), firstPayment: { kind: 'one_period' }, quotedPayment: mu(8_700) }));
  collect(out, sam, checkPlan(204_000, { count: 24, apr: null, firstPayment: { kind: 'one_period' }, quotedPayment: mu(9_000) }));
  collect(out, sam, checkPlan(204_000, { count: 24, apr: null, firstPayment: { kind: 'one_period' }, quotedPayment: mu(1_000_000) }));
  collect(
    out,
    sam,
    checkPlan(120_000, {
      count: 12,
      apr: percent('9.9'),
      firstPayment: { kind: 'deferred', firstDate: '2026-12-01', interestDuringPause: false },
      deferredInterestTerm: true,
    })
  );
  collect(out, sam, checkOnce(10_000, { foreign: { currency: 'EUR' as never, atTodaysRate: true } }));
  // typical_short, month_heading_short with and without a category
  const short = toV3Inputs(personById('sam'), { everydayOverride: mu(900_000) });
  collect(out, short, checkOnce(10_000));
  collect(out, withOctLines(short, [v3Line({ id: 'big', date: '2026-10-02', amount: 20_000, role: 'spending', categoryId: 'food' })]), checkOnce(10_000));
  // yearly_bill_choice_needed
  collect(
    out,
    { ...sam, series: [...sam.series, v3Series({ id: 'ins', role: 'bill', cadence: { unit: 'month', every: 12 }, anchorDate: '2026-03-01', amount: 120_000 })] },
    checkOnce(10_000)
  );
  // unsaved_changes
  collect(out, { ...sam, unsavedWrites: 2 }, checkOnce(10_000));
  // unspent_stale and unspent_drifted
  collect(out, { ...sam, unspent: { amount: mu(240_000), at: '2026-08-01' } }, checkOnce(10_000));
  collect(out, { ...sam, unspent: { amount: mu(9_999_999), at: '2026-10-03' } }, checkOnce(10_000));
  // envelope_used: an own envelope carries part of a price the month cannot
  collect(
    out,
    { ...sam, envelopes: [{ id: 'e1', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: mu(60_000), purposeId: null }] },
    checkOnce(90_000, { envelopeId: 'e1' })
  );
  // from_your_figures: rough figures only
  collect(out, inputsOf({ rough: { income: mu(400_000), expenses: mu(150_000), saving: mu(30_000), debt: mu(0), invest: mu(0), asOf: '2026-10-01' } }), checkOnce(10_000));
  // income_kind_unmarked: other income whose kind carries no counts-as
  collect(
    out,
    {
      ...sam,
      series: [
        ...sam.series,
        v3Series({ id: 'div', role: 'other_income', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-20', amount: 5_000, incomeKind: { kind: 'preset', value: 'dividends' } }),
      ],
    },
    checkOnce(10_000)
  );
  // D-46: variable and seasonal earners. 14 full months of records, asOf in December (a seasonal earner with 12+ months
  // is judged against last December), plus a confirmed figure and a variable earner.
  const gigPay = v3Series({ id: 'gig', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2025-01-01', amount: 70_000 });
  const gigMonths = Array.from({ length: 14 }, (_, i) => {
    const t = 9 + i; // 2025-10 ...
    const m = `${2025 + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    const pay = ['05', '06', '07', '08', '09'].includes(m.slice(5)) ? 145_000 : 70_000;
    return monthOf(m, [
      v3Line({ id: `gp-${m}`, date: `${m}-01`, amount: pay, role: 'income', seriesId: 'gig' }),
      v3Line({ id: `ge-${m}`, date: `${m}-15`, amount: m.endsWith('-12') ? 50_000 : 30_000 }),
    ]);
  });
  const gig = (pattern: 'seasonal' | 'variable', over: Partial<V3Inputs> = {}): V3Inputs =>
    inputsOf({
      asOf: '2026-12-10',
      series: [gigPay],
      months: [...gigMonths, monthOf('2026-12', [], { full: false })],
      profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern },
      ...over,
    });
  collect(out, gig('seasonal'), checkOnce(10_000)); // history_window_12, income_from_expected (last_year), same_season_compared
  collect(out, gig('variable', { months: [...gigMonths.slice(2), monthOf('2026-12', [], { full: false })] }), checkOnce(10_000)); // source: low
  collect(out, gig('variable', { expectedIncome: [{ month: '2026-12', amount: mu(120_000), at: '2026-12-01' }] }), checkOnce(10_000)); // source: confirmed
  // D-46: the pay series is set at the high-season amount; asOf is in a lean month, so January's pay is capped at the expected 70,000.
  const highPay = v3Series({ id: 'gig', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2025-01-01', amount: 145_000 });
  collect(out, gig('seasonal', { series: [highPay] }), checkOnce(10_000)); // pay_capped_expected
  return out;
}

const CORPUS = buildCorpus();

/** The group object in en.ts: decide.v3.fact | notice | missing | readiness. */
const COPY = (en as unknown as { decide: { v3: Record<string, Record<string, string>> } }).decide.v3;

const FACT_CODES = Object.keys(FACT_KEYS) as FactCode[];
const NOTICE_CODES = Object.keys(NOTICE_KEYS) as NoticeCode[];
const MISSING_CODES = Object.keys(MISSING_KEYS) as MissingCode[];

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!);
}

/** The code's own string plus its `_variant` strings (a key that starts with the code and is not another code). */
function variantsOf(group: 'fact' | 'notice' | 'missing', code: string, allCodes: readonly string[]): Record<string, string> {
  const table = COPY[group]!;
  const found: Record<string, string> = {};
  for (const k of Object.keys(table)) {
    if (k === code || (k.startsWith(`${code}_`) && !allCodes.includes(k))) found[k] = table[k]!;
  }
  return found;
}

const RESOLVER_TARGETS: Readonly<Record<string, string>> = COPY_RESOLVERS;
const resolverIdOf = (placeholder: string): string | undefined =>
  Object.keys(RESOLVER_TARGETS).find((id) => RESOLVER_TARGETS[id] === placeholder);
const DISCRIMINATORS: readonly string[] = DISCRIMINATOR_KEYS;

/** True when the placeholder reads one of the keys: directly, or as the name of a resolved id. */
function readsKey(placeholder: string, keys: readonly string[]): boolean {
  if (keys.includes(placeholder)) return true;
  const id = resolverIdOf(placeholder);
  return id !== undefined && keys.includes(id);
}

describe('M-03 copy contract: engine keys and en.ts placeholders agree', () => {
  it('the corpus is not trivial', () => {
    expect(CORPUS.length).toBeGreaterThan(200);
  });

  it('(b) every emitted instance carries only keys its table row declares', () => {
    const bad = CORPUS.filter((e) => {
      const declared = e.group === 'fact' ? FACT_VALUE_KEYS[e.code as FactCode] : NOTICE_VALUE_KEYS[e.code as NoticeCode];
      return Object.keys(e.values).some((k) => !declared.includes(k));
    }).map((e) => `${e.group}.${e.code} ${Object.keys(e.values).join(',')}`);
    expect([...new Set(bad)]).toEqual([]);
  });

  it('(b) no emitted value is null or a scaled bigint string', () => {
    const bad = CORPUS.flatMap((e) =>
      Object.entries(e.values)
        .filter(([, v]) => v === null || (typeof v === 'string' && /^\d{9,}$/.test(v)))
        .map(([k]) => `${e.group}.${e.code}.${k}`)
    );
    expect([...new Set(bad)]).toEqual([]);
  });

  it('(c) every placeholder in a fact or notice string is a key its code emits, or a resolver for one', () => {
    const bad: string[] = [];
    for (const [group, codes, table] of [
      ['fact', FACT_CODES, FACT_VALUE_KEYS],
      ['notice', NOTICE_CODES, NOTICE_VALUE_KEYS],
    ] as const) {
      for (const code of codes) {
        const keys = (table as Record<string, readonly string[]>)[code]!;
        const variants = variantsOf(group, code, codes);
        expect({ group, code, hasCopy: Object.keys(variants).length > 0 }).toEqual({ group, code, hasCopy: true });
        for (const [name, text] of Object.entries(variants)) {
          for (const p of placeholders(text)) if (!readsKey(p, keys)) bad.push(`${group}.${name} {{${p}}}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('(d) every non-discriminator key is read by some variant of its code, or by the question it feeds', () => {
    const consumers = (notice: string): string[] =>
      (Object.keys(MISSING_VALUE_SOURCE) as MissingCode[])
        .filter((m) => MISSING_VALUE_SOURCE[m as keyof typeof MISSING_VALUE_SOURCE] === notice)
        .flatMap((m) => Object.values(variantsOf('missing', m, MISSING_CODES)));
    const unread: string[] = [];
    for (const [group, codes, table] of [
      ['fact', FACT_CODES, FACT_VALUE_KEYS],
      ['notice', NOTICE_CODES, NOTICE_VALUE_KEYS],
    ] as const) {
      for (const code of codes) {
        const texts = [...Object.values(variantsOf(group, code, codes)), ...(group === 'notice' ? consumers(code) : [])];
        const read = new Set(texts.flatMap(placeholders));
        for (const key of (table as Record<string, readonly string[]>)[code]!) {
          if (DISCRIMINATORS.includes(key)) continue;
          const name = key in COPY_RESOLVERS ? COPY_RESOLVERS[key as keyof typeof COPY_RESOLVERS] : key;
          if (!read.has(name)) unread.push(`${group}.${code}.${key}`);
        }
      }
    }
    expect(unread).toEqual([]);
  });

  it('(e) every code is emitted by the corpus, except those still waiting for their plan', () => {
    const emitted = new Set(CORPUS.map((e) => `${e.group}.${e.code}`));
    const missing = [...FACT_CODES.map((c) => `fact.${c}`), ...NOTICE_CODES.map((c) => `notice.${c}`)].filter(
      (id) => !emitted.has(id) && !NOT_YET_EMITTED.includes(id.split('.')[1]!)
    );
    expect(missing).toEqual([]);
    const known = new Set<string>([...FACT_CODES, ...NOTICE_CODES]);
    expect(NOT_YET_EMITTED.filter((c) => !known.has(c))).toEqual([]);
  });

  it('(f) a question reads its values from the notice it names, and the pair covers every key', () => {
    for (const [question, noticeCode] of Object.entries(MISSING_VALUE_SOURCE)) {
      const noticeKeys = NOTICE_VALUE_KEYS[noticeCode];
      const variants = variantsOf('missing', question, MISSING_CODES);
      expect(Object.keys(variants).length).toBeGreaterThan(0);
      const read = new Set<string>();
      for (const [name, text] of Object.entries(variants)) {
        for (const p of placeholders(text)) {
          expect({ name, p, ok: readsKey(p, noticeKeys) }).toEqual({ name, p, ok: true });
          read.add(p);
        }
      }
      const noticeRead = new Set(Object.values(variantsOf('notice', noticeCode, NOTICE_CODES)).flatMap(placeholders));
      for (const key of noticeKeys) {
        if (DISCRIMINATORS.includes(key)) continue;
        const name = key in COPY_RESOLVERS ? COPY_RESOLVERS[key as keyof typeof COPY_RESOLVERS] : key;
        expect({ question, key, covered: read.has(name) || noticeRead.has(name) }).toEqual({ question, key, covered: true });
      }
    }
  });

  it('D-62 account_use_question_fund has copy and no placeholder; other questions carry none outside the source map', () => {
    const fund = COPY.missing!['account_use_question_fund'];
    expect(typeof fund).toBe('string');
    expect(fund!.length).toBeGreaterThan(0);
    expect(placeholders(fund!)).toEqual([]);
    for (const code of MISSING_CODES) {
      if (code in MISSING_VALUE_SOURCE) continue;
      for (const text of Object.values(variantsOf('missing', code, MISSING_CODES))) expect(placeholders(text)).toEqual([]);
    }
  });

  it('M-03 line_crossed has one string per unit and each reads value and limit', () => {
    const v = variantsOf('fact', 'line_crossed', FACT_CODES);
    expect(Object.keys(v).sort()).toEqual(['line_crossed', 'line_crossed_money', 'line_crossed_percent', 'line_crossed_tenths']);
    expect(placeholders(v['line_crossed_percent']!).sort()).toEqual(['limit', 'value']);
    expect(placeholders(v['line_crossed_money']!).sort()).toEqual(['limit', 'value']);
    expect(placeholders(v['line_crossed_tenths']!).sort()).toEqual(['limit', 'value']);
    expect(v['line_crossed_percent']).toContain('of your income');
    expect(v['line_crossed_tenths']).toContain('times your monthly income');
    const units = new Set(CORPUS.filter((e) => e.code === 'line_crossed').map((e) => e.values['unit']));
    expect([...units].sort()).toEqual(['money', 'percent', 'tenths']);
  });

  it('M-03 implied_rate is a readable percentage', () => {
    const rates = CORPUS.filter((e) => e.code === 'implied_rate').map((e) => e.values['rate']);
    expect(rates.length).toBeGreaterThan(0);
    for (const r of rates) expect(r).toMatch(/^\d+(\.\d+)?$/);
  });

  it('D-52 every readiness code has declarative en.ts copy with no placeholder', () => {
    expect(Object.keys(READINESS_KEYS).sort()).toEqual(['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing']);
    for (const [code, key] of Object.entries(READINESS_KEYS)) {
      const text = COPY.readiness![code];
      expect({ key, text: typeof text }).toEqual({ key, text: 'string' });
      expect(text!.length).toBeGreaterThan(0);
      expect(text).not.toContain('{{');
      expect(text).not.toMatch(/\b(should|advice|recommend)/i);
    }
  });

  it('D-59 MISSING_PRIORITY holds every missing code once, each with copy', () => {
    expect([...MISSING_PRIORITY].sort()).toEqual(Object.keys(MISSING_KEYS).sort());
    expect(new Set(MISSING_PRIORITY).size).toBe(MISSING_PRIORITY.length);
    for (const code of MISSING_PRIORITY) {
      const text = COPY.missing![code];
      expect({ code, text: typeof text }).toEqual({ code, text: 'string' });
    }
    expect(MISSING_PRIORITY).toContain('account_use_question');
    expect(MISSING_PRIORITY).toContain('pay_arrival_question');
  });
});
