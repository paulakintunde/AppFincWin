/**
 * Loader for the variable-income, account and readiness goldens (05.1-48). Test-only.
 *
 * Reads golden/variable-income.json and turns every case into V3Inputs and a CheckV2 through adapter.ts (W9): the person
 * must exist and every patch and field name must be one this loader knows, otherwise it throws. Expectations are written
 * by hand with their working (D-28 style); nothing here derives an expectation from the engine.
 */
import { minorUnits } from '../../../../money/types';
import type {
  AccountUse,
  CheckV2,
  Code,
  ConfidenceLevel,
  ExpectedMonthIncome,
  IncomeProfile,
  MissingCode,
  NoticeCode,
  ReadinessCode,
  ReadyBy,
  ReasonCode,
  UnexplainedUse,
  V3Inputs,
  Variant,
} from '../../types';
import {
  toCheckV2,
  toV3Inputs,
  type FixtureLine,
  type FixtureMonth,
  type FixturePerson,
  type FixturePurchase,
} from './adapter';
import file from './variable-income.json';

export interface VariablePerson extends FixturePerson {
  /** The account that holds the emergency fund; absent or null = linked to no account (D-62). Only read when `accounts` is set. */
  fundAccountId?: string | null;
}

type Pair = { code: string; values: Record<string, number | string | null> };

export interface VariableExpect {
  code: Code;
  variant?: Variant | null;
  missing?: MissingCode[];
  facts?: Pair[];
  notices?: Pair[];
  noticesAbsent?: NoticeCode[];
  reasons?: ReasonCode[];
  confidence?: ConfidenceLevel;
  futures?: boolean;
  readyBy?: ReadyBy;
  split?: { source: string; amount: number }[];
  readiness?: { ready: boolean; missing: ReadinessCode[] };
  funds?: { suggested?: number; unexplained?: number; ringFenced?: number; spending?: number };
  figures?: { monthLeft?: number; typicalIncome?: number; leanLeft?: number; lowLeft?: number; erest?: number };
  /** The wording of the account question the screen picks from the notices (D-62). */
  questionKey?: 'account_use_question' | 'account_use_question_fund';
}

interface AccountPatch {
  id: string;
  use?: AccountUse | null;
  balance?: number;
  remove?: true;
}

export interface VariableCase {
  id: string;
  person: string;
  asOf?: string;
  dropMonthsBefore?: string;
  profilePatch?: Partial<IncomeProfile>;
  seriesPatch?: { id: string; amount: number }[];
  envelopesPatch?: { id: string; accountId: string | null }[];
  accountsPatch?: AccountPatch[];
  payArrivals?: { seriesId: string; date: string; arrived: boolean }[];
  monthsPatch?: { month: string; full?: boolean; drop?: true }[];
  extraMonths?: FixtureMonth[];
  removeLines?: string[];
  balanceDelta?: number;
  unexplainedAnswer?: { amount: number; use: UnexplainedUse };
  expectedIncome?: ExpectedMonthIncome[];
  heldBridges?: { id: string; amount: number }[];
  unspentPatch?: { amount?: number; at?: string };
  fundAccountId?: string | null;
  purchase: FixturePurchase & { volatileCover?: boolean | null };
  expect: VariableExpect;
  working: string;
}

export interface LoadedCase {
  id: string;
  person: string;
  inputs: V3Inputs;
  check: CheckV2;
  expect: VariableExpect;
  working: string;
}

const CASE_KEYS: readonly string[] = [
  'id', 'person', 'asOf', 'dropMonthsBefore', 'profilePatch', 'seriesPatch', 'envelopesPatch', 'accountsPatch', 'payArrivals',
  'monthsPatch', 'extraMonths', 'removeLines', 'balanceDelta', 'unexplainedAnswer', 'expectedIncome', 'heldBridges', 'unspentPatch',
  'fundAccountId', 'purchase', 'expect', 'working',
];
const EXPECT_KEYS: readonly string[] = [
  'code', 'variant', 'missing', 'facts', 'notices', 'noticesAbsent', 'reasons', 'confidence', 'futures', 'readyBy', 'split', 'readiness',
  'funds', 'figures', 'questionKey',
];
const FUNDS_KEYS: readonly string[] = ['suggested', 'unexplained', 'ringFenced', 'spending'];
const FIGURE_KEYS: readonly string[] = ['monthLeft', 'typicalIncome', 'leanLeft', 'lowLeft', 'erest'];

const DATA = file as unknown as { persons: VariablePerson[]; cases: VariableCase[] };

function onlyKnown(obj: object, allowed: readonly string[], where: string): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new RangeError(`${where}: unknown key "${k}"`);
}

export function variablePersons(): readonly VariablePerson[] {
  return DATA.persons;
}

export function variablePersonById(id: string): VariablePerson {
  const p = DATA.persons.find((x) => x.id === id);
  if (!p) throw new RangeError(`variable-income: no fixture person "${id}"`);
  return p;
}

function mustFind<T>(list: readonly T[], pred: (x: T) => boolean, what: string): T {
  const found = list.find(pred);
  if (found === undefined) throw new RangeError(`variable-income: unknown ${what}`);
  return found;
}

/** Applies a case's patches to a copy of its person. Unknown ids, months and series throw. */
export function resolveVariablePerson(c: VariableCase): VariablePerson {
  onlyKnown(c, CASE_KEYS, `case ${c.id}`);
  onlyKnown(c.expect, EXPECT_KEYS, `case ${c.id} expect`);
  if (c.expect.funds) onlyKnown(c.expect.funds, FUNDS_KEYS, `case ${c.id} expect.funds`);
  if (c.expect.figures) onlyKnown(c.expect.figures, FIGURE_KEYS, `case ${c.id} expect.figures`);
  let p: VariablePerson = { ...variablePersonById(c.person) };
  if (c.asOf !== undefined) p = { ...p, asOf: c.asOf };
  if (c.dropMonthsBefore !== undefined) {
    const cut = c.dropMonthsBefore;
    p = { ...p, months: p.months.filter((m) => m.month >= cut) };
  }
  for (const mp of c.monthsPatch ?? []) {
    mustFind(p.months, (m) => m.month === mp.month, `month ${mp.month} in case ${c.id}`);
    p = {
      ...p,
      months: mp.drop === true ? p.months.filter((m) => m.month !== mp.month) : p.months.map((m) => (m.month === mp.month ? { ...m, full: mp.full ?? m.full } : m)),
    };
  }
  if (c.extraMonths) p = { ...p, months: [...p.months, ...c.extraMonths] };
  if (c.removeLines) {
    const ids = new Set(p.months.flatMap((m) => m.lines.map((l: FixtureLine) => l.id)));
    for (const id of c.removeLines) if (!ids.has(id)) throw new RangeError(`variable-income: unknown line ${id} in case ${c.id}`);
    p = { ...p, months: p.months.map((m) => ({ ...m, lines: m.lines.filter((l) => !(c.removeLines as string[]).includes(l.id)) })) };
  }
  for (const s of c.seriesPatch ?? []) {
    mustFind(p.series, (x) => x.id === s.id, `series ${s.id} in case ${c.id}`);
    p = { ...p, series: p.series.map((x) => (x.id === s.id ? { ...x, amount: s.amount } : x)) };
  }
  if (c.profilePatch) {
    if (p.profile === null) throw new RangeError(`variable-income: case ${c.id} patches a profile that person ${p.id} does not have`);
    p = { ...p, profile: { ...p.profile, ...c.profilePatch } };
  }
  for (const e of c.envelopesPatch ?? []) {
    mustFind(p.envelopes, (x) => x.id === e.id, `envelope ${e.id} in case ${c.id}`);
    p = { ...p, envelopes: p.envelopes.map((x) => (x.id === e.id ? { ...x, accountId: e.accountId } : x)) };
  }
  if (c.accountsPatch) {
    if (p.accounts === undefined) throw new RangeError(`variable-income: case ${c.id} patches accounts that person ${p.id} does not state`);
    let accounts = p.accounts;
    for (const a of c.accountsPatch) {
      mustFind(accounts, (x) => x.id === a.id, `account ${a.id} in case ${c.id}`);
      accounts =
        a.remove === true
          ? accounts.filter((x) => x.id !== a.id)
          : accounts.map((x) =>
              x.id === a.id ? { ...x, ...(a.use !== undefined ? { use: a.use } : {}), ...(a.balance !== undefined ? { balance: a.balance } : {}) } : x
            );
    }
    p = { ...p, accounts };
  }
  if (c.balanceDelta !== undefined) {
    if (p.accounts !== undefined) {
      const main = p.accounts[0];
      if (main === undefined) throw new RangeError(`variable-income: person ${p.id} has no account for balanceDelta in case ${c.id}`);
      p = { ...p, accounts: p.accounts.map((a, i) => (i === 0 ? { ...a, balance: a.balance + (c.balanceDelta as number) } : a)) };
    } else {
      p = { ...p, balance: p.balance + c.balanceDelta };
    }
  }
  if (c.unspentPatch) {
    p = { ...p, unspent: { amount: c.unspentPatch.amount ?? p.unspent?.amount ?? 0, at: c.unspentPatch.at ?? p.unspent?.at ?? p.asOf } };
  }
  if (c.expectedIncome) p = { ...p, expectedIncome: c.expectedIncome.map((e) => ({ month: e.month, amount: e.amount, at: e.at })) };
  if (c.heldBridges) p = { ...p, heldBridges: c.heldBridges };
  if (c.payArrivals) p = { ...p, payArrivals: c.payArrivals };
  if (c.fundAccountId !== undefined) p = { ...p, fundAccountId: c.fundAccountId };
  return p;
}

export function loadVariableCase(c: VariableCase): LoadedCase {
  const person = resolveVariablePerson(c);
  let inputs = toV3Inputs(person);
  // adapter.ts links a fund to an account only for persons it builds accounts for; a person that states its own accounts
  // names the fund's account here (D-62: null or a removed account means unlinked).
  if (person.accounts !== undefined && inputs.emergency !== null) {
    inputs = { ...inputs, emergency: { amount: inputs.emergency.amount, accountId: person.fundAccountId ?? null } };
  }
  if (c.unexplainedAnswer) {
    inputs = { ...inputs, unexplainedAnswer: { amount: minorUnits(c.unexplainedAnswer.amount), use: c.unexplainedAnswer.use, at: person.asOf } };
  }
  const base = toCheckV2(c.purchase);
  const check: CheckV2 = c.purchase.volatileCover === undefined ? base : { ...base, volatileCover: c.purchase.volatileCover };
  return { id: c.id, person: c.person, inputs, check, expect: c.expect, working: c.working };
}

export function loadAllVariableCases(): LoadedCase[] {
  return DATA.cases.map(loadVariableCase);
}

