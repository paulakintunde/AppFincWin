/**
 * Golden fixture adapter (D-22), test-only. Maps the engine-neutral scenarios in prototype-decide.json (written by
 * scripts/decide-golden/generate-golden.mjs from the prototype's own text) onto DecideSnapshot / PurchaseCheck.
 *
 * Neutralisation: every month is full with all lines paid, no refunds, no series, no bills, no scheduled outflows,
 * no income series, no future changes (D-41…D-47, D-61 neutral). Household scenarios split the PURCHASE with the
 * scenario's even/weight rule and keep existing spending unshared (`mine`), because the prototype's `left` reads its
 * expenses unshared (D-34 neutralisation).
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { WARNING_ORDER } from '../../constants';
import type { BuyPayment, CardPayoff, DecideSnapshot, PurchaseCheck, WarningCode } from '../../types';
import { USD, fullMonth, snapshotOf } from '../helpers/fixtures';

const mu = (n: number): MinorUnits => minorUnits(n);

export interface FixturePayment {
  readonly method: 'cash' | 'loan' | 'card' | 'instalment' | 'lump' | 'monthly';
  readonly deposit?: number;
  readonly termMonths?: number | null;
  readonly apr?: string;
  readonly payoff?: 'full' | 'months' | 'minimum';
  readonly months?: number;
  readonly minimumTerms?: { minimumPercent: string; interestAdded: boolean; floor: number };
  readonly dealerCap?: number;
  readonly instalmentAmount?: number;
  readonly instalmentCount?: number;
}

export type FixtureCheck =
  | {
      readonly kind: 'buy';
      readonly price: number;
      readonly dayFees: number;
      readonly runningCostsNet: number;
      readonly itemType: string;
      readonly payment: FixturePayment;
    }
  | { readonly kind: 'invest'; readonly amount: number; readonly payment: FixturePayment };

export interface FixtureScenario {
  readonly name: string;
  readonly months: readonly { income: number; spending: number }[];
  readonly cash: number;
  readonly debts: readonly {
    id: string;
    balance: number;
    minimumPayment: number;
    secured: boolean;
    rate: string;
    revolving: boolean;
  }[];
  readonly saving: number;
  readonly investing: number;
  readonly limits: { reserve: number; dsr: string; investingFloor: number };
  readonly return: string;
  readonly scope:
    | { kind: 'personal' }
    | { kind: 'household'; memberCount: number; myIndex: number; rule: 'even' | 'weight'; weights?: number[] };
  readonly check: FixtureCheck;
  readonly prototype: {
    readonly money: {
      avg: number;
      worst: number;
      best: number;
      steady: 'Steady' | 'Variable' | 'Volatile';
      basis: 'avg' | 'worst';
      inBasis: number;
      exp: number;
      left: number;
    };
    readonly plan: { day: number; mo: number; n: number; fin: number; tot: number; interest: number; miss: boolean };
    readonly assess: {
      state: 'fits' | 'adjust' | 'no' | 'missing';
      left: number;
      cashAfter: number;
      unsecAfter: number;
      investAtRisk: number;
      investAfter: number;
      mineCash: number;
      minePay: number;
      newMo: number;
      w: { k: string; short: number }[];
    };
    readonly bisect: { best: number | null } | null;
  };
}

/** Prototype dollars (float) to minor units. */
export function dollarsToMinor(x: number): number {
  return Math.round(x * 100);
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function toSnapshot(scn: FixtureScenario): DecideSnapshot {
  const months = scn.months.map((m, i) => fullMonth(`2026-${pad(i + 1)}`, m.income, m.spending));
  const asOf = `2026-${pad(scn.months.length + 1)}-01`;
  const scope: DecideSnapshot['scope'] =
    scn.scope.kind === 'personal'
      ? { kind: 'personal' }
      : {
          kind: 'household',
          memberCount: scn.scope.memberCount,
          myIndex: scn.scope.myIndex,
          rule: scn.scope.rule === 'even' ? { kind: 'even' } : { kind: 'weight', weights: scn.scope.weights ?? [] },
        };
  return snapshotOf({
    currency: USD,
    asOf,
    months,
    bills: [],
    basisOverride: null,
    cashOnHand: mu(scn.cash),
    debts: scn.debts.map((d) => ({
      id: d.id,
      balance: mu(d.balance),
      minimumPayment: mu(d.minimumPayment),
      secured: d.secured,
      apr: percent(d.rate),
      currency: USD,
    })),
    monthlySaving: mu(scn.saving),
    monthlyInvesting: mu(scn.investing),
    scope,
    // D-34 neutralisation: the prototype reads existing spending unshared.
    householdSpending: scn.scope.kind === 'household' ? { rule: { kind: 'mine' }, byCategory: [] } : null,
    limits: {
      reserve: mu(scn.limits.reserve),
      dsrLine: percent(scn.limits.dsr),
      housingLine: null,
      unsecuredIncomeMultiple: 12,
      investingFloor: mu(scn.limits.investingFloor),
      savingFloor: mu(0),
      spareFloor: null,
    },
    projectionReturn: percent(scn.return),
    expenseLines: [],
    incomeSeries: [],
    futureChanges: [],
    investmentBalance: mu(0),
    scheduledOutflows: [],
    projectionRates: [],
  });
}

function cardPayoff(p: FixturePayment): CardPayoff {
  if (p.payoff === 'months') return { kind: 'months', months: p.months ?? 12 };
  return p.payoff === 'minimum' ? { kind: 'minimum' } : { kind: 'full' };
}

export function toCheck(scn: FixtureScenario): PurchaseCheck {
  const c = scn.check;
  if (c.kind === 'invest') {
    return {
      kind: 'invest',
      currency: USD,
      amount: mu(c.amount),
      payment: c.payment.method === 'lump' ? { method: 'lump' } : { method: 'monthly', termMonths: c.payment.termMonths ?? null },
    };
  }
  const p = c.payment;
  let payment: BuyPayment;
  switch (p.method) {
    case 'loan':
      payment = {
        method: 'loan',
        deposit: mu(p.deposit ?? 0),
        termMonths: p.termMonths ?? null,
        apr: p.apr === undefined ? null : percent(p.apr),
      };
      break;
    case 'instalment':
      payment = {
        method: 'instalment',
        instalmentAmount: mu(p.instalmentAmount ?? 0),
        instalmentCount: p.instalmentCount ?? null,
      };
      break;
    case 'card': {
      const t = p.minimumTerms;
      payment = {
        method: 'card',
        card: {
          id: 'c1',
          apr: p.apr === undefined ? null : percent(p.apr),
          minimumTerms:
            t === undefined
              ? null
              : { minimumPercent: percent(t.minimumPercent), interestAdded: t.interestAdded, floor: mu(t.floor) },
          currency: USD,
        },
        payoff: cardPayoff(p),
        dealerCap: p.dealerCap === undefined ? null : mu(p.dealerCap),
      };
      break;
    }
    default:
      payment = { method: 'cash' };
  }
  return {
    kind: 'buy',
    currency: USD,
    price: mu(c.price),
    dayFees: mu(c.dayFees),
    itemType: c.itemType === 'vehicle' ? 'vehicle' : 'general',
    runningCostsNet: mu(c.runningCostsNet),
    payment,
  };
}

export interface ExpectedVerdict {
  readonly state: 'fits' | 'adjust' | 'no';
  readonly warnings: { code: WarningCode; shortfall: number }[];
}

/**
 * The prototype predates D-33 and D-35 (04-CONTEXT, 2026-10-15). This transform is the only place parity expectations
 * are altered; the named tests in deviations/d33-invest-no-inv.test.ts and deviations/d35-pausable-saving-investing.test.ts
 * state the rules directly. Everything else in the prototype's warning list is compared unchanged.
 *
 * Prototype dassess lines replaced (FincWin United.dc.html ~4108-4118): `if(left<0) w.push({k:'month',short:-left})` and
 * `investAtRisk = min(invMo, -left)`, `if(investAfter<minInv) w.push({k:'inv',...})`, state `no` when cashAfter<0 or
 * left<0.
 *  - D-35 (buy): a shortfall is covered by pausing investing first, then saving; that pause is `inv`; the state is `adjust`
 *    unless a shortfall remains, in which case it is `no` and `month` carries the remainder.
 *  - D-33 (invest): no debt lines and never `inv`; `month` carries the whole shortfall.
 */
export function expectedUnderAmendments(scn: FixtureScenario): ExpectedVerdict {
  const P = scn.prototype.assess;
  const isInvest = scn.check.kind === 'invest';
  const keep: string[] = isInvest ? ['cash'] : ['cash', 'dsr', 'owe'];
  const warnings: { code: WarningCode; shortfall: number }[] = P.w
    .filter((w) => keep.includes(w.k))
    .map((w) => ({ code: w.k as WarningCode, shortfall: dollarsToMinor(w.short) }));
  const shortfall = Math.max(0, -dollarsToMinor(P.left));
  let remaining: number;
  if (isInvest) {
    remaining = shortfall;
    if (remaining > 0) warnings.push({ code: 'month', shortfall: remaining });
  } else {
    const inv = Math.min(scn.investing, shortfall);
    const sav = Math.min(scn.saving, shortfall - inv);
    const pause = inv + sav;
    remaining = shortfall - pause;
    if (remaining > 0) warnings.push({ code: 'month', shortfall: remaining });
    if (pause > 0) warnings.push({ code: 'inv', shortfall: pause });
  }
  warnings.sort((a, b) => b.shortfall - a.shortfall || WARNING_ORDER.indexOf(a.code) - WARNING_ORDER.indexOf(b.code));
  const state = P.cashAfter < 0 || remaining > 0 ? 'no' : warnings.length > 0 ? 'adjust' : 'fits';
  return { state, warnings };
}
