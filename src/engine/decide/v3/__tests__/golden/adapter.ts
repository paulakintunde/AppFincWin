/**
 * v3 golden fixture adapter (05.1 S0), test-only. Maps synthetic persons and purchases in JSON onto V3Inputs / CheckV2.
 *
 * Rules: money is minor units (USD). Dates are local 'YYYY-MM-DD'. The fixture never states a derived figure as an
 * input (monthLeft, E, typicalLeft, suggested sum): those appear only in `expect`, with a `working` string. Expectations
 * come from REBUILD-PLAN-v3 section 12 (D-28), never from 00-SCENARIOS.md numbers. Everyone here is synthetic (T-05.1-08).
 */
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import type {
  AccountUse,
  Cadence,
  Code,
  CheckV2,
  ConfidenceLevel,
  CountsAs,
  EmergencyFund,
  Envelope,
  FactCode,
  FirstPayment,
  FundingSource,
  IncomeProfile,
  ItemTypeRef,
  LegacyState,
  LineRole,
  LineSpec,
  MissingCode,
  MonthMark,
  NoticeCode,
  PayV2,
  PresetPurpose,
  ReadyBy,
  RoughFigures,
  SeriesRole,
  SeriesStatus,
  TypicalChoice,
  V3Account,
  V3Debt,
  V3Inputs,
  V3PresetItemType,
  Variant,
} from '../../types';
import { inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';
import personsFile from './personas.json';

const mu = (n: number): MinorUnits => minorUnits(n);

export interface FixtureSeries {
  id: string;
  name: string;
  role: SeriesRole;
  cadence: Cadence;
  anchorDate: string;
  endDate?: string | null;
  amount: number;
  confirmed?: boolean;
  status?: SeriesStatus;
  payGroup?: string | null;
  countsAs?: CountsAs;
  typicalChoice?: TypicalChoice;
  categoryId?: string | null;
  isHousing?: boolean;
  savingMode?: 'fixed' | 'flexible' | null;
}
export interface FixtureLine {
  id: string;
  date: string;
  amount: number;
  role: LineRole;
  seriesId?: string | null;
  categoryId?: string | null;
  status?: 'paid' | 'pending';
  coversMonths?: number | null;
  expected?: boolean;
  name?: string;
}
export interface FixtureMonth {
  month: string;
  full?: boolean;
  mark?: MonthMark;
  lines: FixtureLine[];
}
/** JSON form of V3Debt: the rate is text so it can be a Percent. */
export interface FixtureDebt {
  id: string;
  kind: 'loan' | 'card' | 'other';
  balance: number;
  minimum: number;
  aprText: string | null;
  secured: boolean;
  isHousing: boolean;
}
/** JSON form of a limit line: percentages are text. */
export interface FixtureLimit {
  id: string;
  on: boolean;
  source: 'builtin' | 'own' | 'legacy';
  spec:
    | { kind: 'housing_share' | 'debt_share'; pctText: string }
    | { kind: 'unsecured_multiple'; times: number }
    | { kind: 'category_monthly_cap'; categoryId: string; cap: number }
    | { kind: 'single_purchase_cap'; cap: number }
    | { kind: 'category_income_share'; categoryId: string; pctText: string }
    | { kind: 'unspent_floor'; floor: number };
}
export interface FixturePerson {
  id: string;
  currency: string;
  asOf: string;
  months: FixtureMonth[];
  series: FixtureSeries[];
  profile: IncomeProfile | null;
  rough: RoughFigures | null;
  balance: number;
  unspent: { amount: number; at: string } | null;
  emergency: number | null;
  envelopes: Envelope[];
  debts: FixtureDebt[];
  everydayOverride: number | null;
  limits?: FixtureLimit[];
  expectedIncome?: { month: string; amount: number; at: string }[];
  heldBridges?: { id: string; amount: number }[];
  payArrivals?: { seriesId: string; date: string; arrived: boolean }[];
  accounts?: { id: string; balance: number; use: AccountUse | null }[];
  note: string;
}
export interface FixturePlanPay {
  mode: 'plan';
  cadence: Cadence;
  count: number | null;
  termMonths: number | null;
  aprText: string | null;
  fees: { setup: number; perPeriod: number; end: number };
  deposit: number;
  tradeIn: number;
  quotedPayment: number | null;
  firstPayment: FirstPayment | null;
  deferredInterestTerm: boolean;
}
export interface FixturePurchase {
  price: number | null;
  taxPercent: string | null;
  oneOffFees: number;
  itemType: string;
  purpose: string | null;
  emergency: boolean;
  envelopeId: string | null;
  categoryId: string | null;
  pay: { mode: 'once' } | FixturePlanPay;
  extras: Record<string, number>;
  share: 'personal' | { kind: 'household'; members: number; rule: 'even' };
  foreign: { currency: string } | null;
}
export interface FixtureExpect {
  code: Code;
  variant?: Variant | null;
  legacyState: LegacyState;
  readyBy?: ReadyBy | null;
  band?: number;
  split?: { source: FundingSource; amount: number }[];
  facts?: FactCode[];
  notices?: NoticeCode[];
  missing?: MissingCode[];
  month?: {
    moneyIn?: number;
    moneyOut?: number;
    monthLeft?: number;
    e?: number;
    typicalLeft?: number;
    lowLeft?: number;
    lowMonth?: string;
    erest?: number;
  };
  unspentAfter?: number;
  confidence?: ConfidenceLevel;
  working: string;
}
/**
 * Scenario-local edits to the base person, so a situation can say "Sam, plus a repair" without copying six months.
 * Applied in this order by resolveScenarioPerson: personOverrides (shallow), replaceSpending, addSeries, setSeriesAmount, addLines.
 */
export interface FixtureScenario {
  id: string;
  title: string;
  person: string;
  personOverrides?: Partial<FixturePerson>;
  /** Replaces the everyday (role spending, no series) lines of a month. */
  replaceSpending?: { month: string; mark?: MonthMark; lines: FixtureLine[] }[];
  addSeries?: FixtureSeries[];
  setSeriesAmount?: { id: string; amount: number }[];
  addLines?: { month: string; line: FixtureLine }[];
  purchase: FixturePurchase;
  expect: FixtureExpect;
  source: string;
}

const PERSONS: readonly FixturePerson[] = (personsFile as unknown as { persons: FixturePerson[] }).persons;

export function loadPersons(): readonly FixturePerson[] {
  return PERSONS;
}

export function personById(id: string): FixturePerson {
  const found = PERSONS.find((p) => p.id === id);
  if (!found) throw new RangeError(`personById: no fixture person "${id}"`);
  return found;
}

/** The person a scenario runs on, with its scenario-local edits applied. Pure: the base person is never mutated. */
export function resolveScenarioPerson(s: FixtureScenario): FixturePerson {
  let person: FixturePerson = { ...personById(s.person), ...(s.personOverrides ?? {}) };
  for (const r of s.replaceSpending ?? []) {
    person = {
      ...person,
      months: person.months.map((m) =>
        m.month === r.month
          ? {
              ...m,
              mark: r.mark !== undefined ? r.mark : m.mark ?? null,
              lines: [...m.lines.filter((l) => !(l.role === 'spending' && !l.seriesId)), ...r.lines],
            }
          : m
      ),
    };
  }
  if (s.addSeries) person = { ...person, series: [...person.series, ...s.addSeries] };
  for (const c of s.setSeriesAmount ?? []) {
    person = { ...person, series: person.series.map((x) => (x.id === c.id ? { ...x, amount: c.amount } : x)) };
  }
  for (const a of s.addLines ?? []) {
    person = {
      ...person,
      months: person.months.map((m) => (m.month === a.month ? { ...m, lines: [...m.lines, a.line] } : m)),
    };
  }
  return person;
}

function limitSpec(spec: FixtureLimit['spec']): LineSpec {
  switch (spec.kind) {
    case 'housing_share':
    case 'debt_share':
      return { kind: spec.kind, pct: percent(spec.pctText) };
    case 'unsecured_multiple':
      return { kind: 'unsecured_multiple', times: spec.times };
    case 'category_monthly_cap':
      return { kind: 'category_monthly_cap', categoryId: spec.categoryId, cap: mu(spec.cap) };
    case 'single_purchase_cap':
      return { kind: 'single_purchase_cap', cap: mu(spec.cap) };
    case 'category_income_share':
      return { kind: 'category_income_share', categoryId: spec.categoryId, pct: percent(spec.pctText) };
    case 'unspent_floor':
      return { kind: 'unspent_floor', floor: mu(spec.floor) };
  }
}

/**
 * D-54: fixtures state every account's use; the back-test and shadow generators inherit this rule, the same for every
 * family. Without stated accounts: a main account (everyday, or mixed when the person has envelopes, with the envelopes
 * linked to it) holding total - fund, and a dedicated emergency account holding the fund. The suggested figure and the
 * cash-path opening are then what they were with the total balance and the fund taken out.
 */
export function statedAccounts(person: FixturePerson): {
  accounts: V3Account[];
  envelopes: Envelope[];
  emergency: EmergencyFund | null;
  balance: MinorUnits;
} {
  const fund = person.emergency ?? 0;
  const main = Math.max(0, person.balance - fund);
  const mainId = `${person.id}-main`;
  const fundId = `${person.id}-fund`;
  const accounts: V3Account[] = [
    { id: mainId, balance: mu(main), use: person.envelopes.length > 0 ? { kind: 'mixed', extraSetAside: null } : { kind: 'everyday' } },
  ];
  if (person.emergency !== null) accounts.push({ id: fundId, balance: mu(fund), use: { kind: 'dedicated', purpose: { kind: 'emergency' } } });
  return {
    accounts,
    envelopes: person.envelopes.map((e) => ({ ...e, accountId: mainId })),
    emergency: person.emergency === null ? null : { amount: mu(fund), accountId: fundId },
    balance: mu(main),
  };
}

export function toV3Inputs(person: FixturePerson, overrides: Partial<V3Inputs> = {}): V3Inputs {
  const stated = person.accounts ? null : statedAccounts(person);
  const debts: V3Debt[] = person.debts.map((d) => ({
    id: d.id,
    kind: d.kind,
    balance: mu(d.balance),
    minimum: mu(d.minimum),
    apr: d.aprText === null ? null : percent(d.aprText),
    secured: d.secured,
    isHousing: d.isHousing,
  }));
  return inputsOf({
    asOf: person.asOf,
    months: person.months.map((m) =>
      monthOf(
        m.month,
        m.lines.map((l) =>
          v3Line({
            id: l.id,
            date: l.date,
            amount: l.amount,
            role: l.role,
            seriesId: l.seriesId ?? null,
            categoryId: l.categoryId ?? null,
            status: l.status ?? 'paid',
            coversMonths: l.coversMonths ?? null,
            expected: l.expected ?? false,
          })
        ),
        { full: m.full ?? true, mark: m.mark ?? null }
      )
    ),
    series: person.series.map((s) =>
      v3Series({
        id: s.id,
        role: s.role,
        cadence: s.cadence,
        anchorDate: s.anchorDate,
        endDate: s.endDate ?? null,
        amount: s.amount,
        status: s.status ?? 'live',
        confirmed: s.confirmed ?? true,
        payGroup: s.payGroup ?? null,
        countsAs: s.countsAs ?? null,
        typicalChoice: s.typicalChoice ?? null,
        categoryId: s.categoryId ?? null,
        isHousing: s.isHousing ?? false,
        savingMode: s.savingMode ?? null,
      })
    ),
    profile: person.profile,
    rough: person.rough,
    balance: stated ? stated.balance : mu(person.balance),
    unspent: person.unspent ? { amount: mu(person.unspent.amount), at: person.unspent.at } : null,
    emergency: stated ? stated.emergency : person.emergency === null ? null : { amount: mu(person.emergency) },
    envelopes: stated ? stated.envelopes : person.envelopes,
    debts,
    everydayOverride: person.everydayOverride === null ? null : mu(person.everydayOverride),
    limits: { lines: (person.limits ?? []).map((l) => ({ id: l.id, on: l.on, source: l.source, spec: limitSpec(l.spec) })) },
    ...(person.expectedIncome
      ? { expectedIncome: person.expectedIncome.map((e) => ({ month: e.month, amount: mu(e.amount), at: e.at })) }
      : {}),
    ...(person.heldBridges ? { heldBridges: person.heldBridges.map((b) => ({ id: b.id, amount: mu(b.amount) })) } : {}),
    ...(person.payArrivals ? { payArrivals: person.payArrivals } : {}),
    accounts: stated ? stated.accounts : (person.accounts ?? []).map((a) => ({ id: a.id, balance: mu(a.balance), use: a.use })),
    ...overrides,
  });
}

function payOf(p: FixturePurchase['pay']): PayV2 {
  if (p.mode === 'once') return { mode: 'once' };
  return {
    mode: 'plan',
    cadence: p.cadence,
    count: p.count,
    termMonths: p.termMonths,
    apr: p.aprText === null ? null : percent(p.aprText),
    fees: { setup: mu(p.fees.setup), perPeriod: mu(p.fees.perPeriod), end: mu(p.fees.end) },
    deposit: mu(p.deposit),
    tradeIn: mu(p.tradeIn),
    quotedPayment: p.quotedPayment === null ? null : mu(p.quotedPayment),
    firstPayment: p.firstPayment,
    deferredInterestTerm: p.deferredInterestTerm,
  };
}

export function toCheckV2(p: FixturePurchase): CheckV2 {
  const itemType: ItemTypeRef = { kind: 'preset', value: p.itemType as V3PresetItemType };
  const extras: Record<string, MinorUnits> = {};
  for (const [k, v] of Object.entries(p.extras)) extras[k] = mu(v);
  return {
    v: 2,
    legacyKind: 'buy',
    price: p.price === null ? null : mu(p.price),
    taxPercent: p.taxPercent === null ? null : percent(p.taxPercent),
    oneOffFees: mu(p.oneOffFees),
    itemType,
    categoryId: p.categoryId,
    purpose: p.purpose === null ? null : { kind: 'preset', value: p.purpose as PresetPurpose },
    emergency: p.emergency,
    envelopeId: p.envelopeId,
    pay: payOf(p.pay),
    extras,
    value: { earnsMonthly: null, savesMonthly: null, useYears: null, cheaperPrice: null },
    share:
      p.share === 'personal'
        ? { kind: 'personal' }
        : { kind: 'household', memberCount: p.share.members, myIndex: 0, rule: { kind: p.share.rule } },
    foreign: p.foreign === null ? null : { currency: p.foreign.currency as never, atTodaysRate: true },
    layerAnswers: {},
  };
}
