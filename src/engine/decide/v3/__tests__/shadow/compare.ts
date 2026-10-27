/**
 * The shadow comparison (05.1-28, D-14, D-17): today's engine against v3 over synthetic data only.
 *
 * Sources: the seeded generated histories, the golden personas (one 0-impact purchase each), the 22 scenarios and the
 * D-18 extras. Nothing is read from disk (JSON is imported by the bundler); no real user's data can enter (D-17).
 *
 * The old-engine adapter marks what the old engine cannot express (deferred plans, foreign currency, extras, deposits with
 * an instalment, plan fees) as 'unsupported'. Those are listed apart: never counted as agreement, never as a change.
 * Old engine runs on the 'month' basis, the live default (D-107).
 */
import { USD } from '../../../__tests__/helpers/fixtures';
import { evaluate } from '../../evaluate';
import { legacyStateOf } from '../../adapters/legacy';
import type { Code, CustomOptions, LegacyState, V3Inputs } from '../../types';
import extraFile from '../golden/extra-d18.json';
import scenariosFile from '../golden/scenarios22.json';
import {
  loadPersons,
  resolveScenarioPerson,
  toCheckV2,
  toV3Inputs,
  withMainBalance,
  type FixturePerson,
  type FixturePurchase,
  type FixtureScenario,
} from '../golden/adapter';
import { assess } from '../../../assess';
import { oldAnswer, toOldCheck, toOldSnapshot } from '../golden/toOld';
import { classify, type Cause } from './classify';
import { generateHistories } from './generate';

export type Source = 'generated' | 'persona' | 'scenario' | 'd18';

export interface ChangedAnswer {
  key: string;
  source: Source;
  old: 'fits' | 'adjust' | 'no' | 'missing';
  v3: Code;
  v3Legacy: LegacyState;
  newFits: boolean;
  cause: Cause;
  detail: Record<string, number | string | null>;
}

export interface ShadowRun {
  changes: ChangedAnswer[];
  unsupported: { key: string; reason: string }[];
  total: number;
  agreed: number;
}

type Scenario = Omit<FixtureScenario, 'expect'>;

const SCENARIOS = (scenariosFile as unknown as { scenarios: Scenario[] }).scenarios;
const EXTRAS = (extraFile as unknown as { scenarios: Scenario[] }).scenarios;

/** Same two scenario-local runs the golden test makes (golden.test.ts): the dog's food as an own question, and situation 14's balance. */
const OWN_PET: CustomOptions = {
  itemTypes: [{ id: 'pet', base: 'general', questionIds: [], ownQuestions: [{ id: 'food', label: 'Food', cadence: 'monthly', cash: true }] }],
  purposes: [],
  cadences: [],
  incomeKinds: [],
};

interface Case {
  key: string;
  source: Source;
  person: FixturePerson;
  purchase: FixturePurchase;
  over: Partial<V3Inputs>;
  own: boolean;
  /** D-54: situation 14 states the engine spending balance as its main account; the old engine keeps the persona as is. */
  v3Person?: FixturePerson;
}

const ZERO_IMPACT: FixturePurchase = {
  price: 100,
  taxPercent: null,
  oneOffFees: 0,
  itemType: 'general',
  purpose: null,
  emergency: false,
  envelopeId: null,
  categoryId: null,
  pay: { mode: 'once' },
  extras: {},
  share: 'personal',
  foreign: null,
};

function cases(): Case[] {
  const out: Case[] = [];
  for (const g of generateHistories()) {
    g.purchases.forEach((purchase, i) => out.push({ key: `generated:${g.person.id}:${i}`, source: 'generated', person: g.person, purchase, over: {}, own: false }));
  }
  for (const person of loadPersons()) {
    out.push({ key: `persona:${person.id}:0`, source: 'persona', person, purchase: ZERO_IMPACT, over: {}, own: false });
  }
  for (const s of SCENARIOS) {
    const own = s.id === '22';
    const over: Partial<V3Inputs> = own ? { custom: OWN_PET } : {};
    const person = resolveScenarioPerson(s as FixtureScenario);
    out.push({ key: `scenario:${s.id}:0`, source: 'scenario', person, purchase: s.purchase, over, own, ...(s.id === '14' ? { v3Person: withMainBalance(person, 300000) } : {}) });
  }
  for (const s of EXTRAS) {
    out.push({ key: `d18:${s.id}:0`, source: 'd18', person: resolveScenarioPerson(s as FixtureScenario), purchase: s.purchase, over: {}, own: false });
  }
  return out;
}

/** The codes of the old engine's warnings for a personal purchase (re-runs assess; only used for changed answers). */
function warningsOf(c: Case): string[] {
  if (c.purchase.share !== 'personal') return [];
  const check = toOldCheck(c.purchase, USD);
  if ('unsupported' in check) return [];
  const verdict = assess(toOldSnapshot(c.person, 'month'), check);
  return 'warnings' in verdict ? verdict.warnings.map((w) => w.code) : []; // a 'missing' verdict carries no warnings
}

export function runShadow(): ShadowRun {
  const changes: ChangedAnswer[] = [];
  const unsupported: { key: string; reason: string }[] = [];
  let agreed = 0;
  const all = cases();
  for (const c of all) {
    const old = oldAnswer(c.person, c.purchase, 'month');
    if (old.state === 'unsupported') {
      unsupported.push({ key: c.key, reason: old.reason });
      continue;
    }
    const check = toCheckV2(c.purchase);
    const ev = evaluate(toV3Inputs(c.v3Person ?? c.person, c.over), c.own ? { ...check, itemType: { kind: 'custom', id: 'pet' } } : check);
    const code = ev.result.code;
    const v3Legacy = legacyStateOf(code);
    if (v3Legacy === old.state) {
      agreed += 1;
      continue;
    }
    const newFits = (code === 'fits_month' || code === 'fits_unspent') && old.state !== 'fits';
    const ow = warningsOf(c);
    changes.push({
      key: c.key,
      source: c.source,
      old: old.state,
      v3: code,
      v3Legacy,
      newFits,
      cause: classify({ ev, code, old: old.state, person: c.person, purchase: c.purchase, oldWarnings: ow }),
      detail: {
        price: c.purchase.price,
        dayOne: ev.purchase === null ? null : Number(ev.purchase.dayOne),
        monthLeft: Number(ev.month.monthLeft),
        erest: Number(ev.month.erest),
        e: ev.month.e === null ? null : Number(ev.month.e),
        typicalLeft: ev.month.typicalLeft === null ? null : Number(ev.month.typicalLeft),
        unspent: ev.funds.unspent === null ? null : Number(ev.funds.unspent.value),
        emergency: ev.funds.emergency === null ? null : Number(ev.funds.emergency),
        variant: ev.result.variant,
        oldWarnings: ow.join(',') || null,
        missing: ev.result.missing.length === 0 ? null : ev.result.missing.join(','),
      },
    });
  }
  return { changes, unsupported, total: all.length, agreed };
}
