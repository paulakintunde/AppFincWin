/**
 * Overdrafts (05.4 FIN-03 / ENG-02; D-26..D-28, D-36..D-38). Pure, integer minor units, no floats, no clock.
 *
 * - Only a checking or current account that the spending balance counts (everyday or mixed use) has an overdraft. Its limit
 *   and rate come from the account; a null limit counts as 0 (D-28). Cards use their credit limit from Grow debts, never this.
 * - The floor is minus the sum of those limits. The 90-day cash path may go below 0 down to the floor and no further (D-27).
 * - Cost (D-36) = (sum over each day below 0 of how far below) x rate / 365, rounded half up once: a daily sum, never the
 *   deepest day times the days. "This purchase adds" is the cost with it minus the cost without it, each rounded first, so the
 *   figures shown add up.
 * - Repeat use (D-37): without the purchase, the account is below 0 on the day before at least 2 of the next 3 paydays. It is
 *   read from the same 90-day path; nothing is stored (the look back at past months is 05.5).
 * Every value a fact carries is a key in FACT_VALUE_KEYS (copy/verdictTable.ts). `zero` is always 0: the screen formats it
 * as the currency's zero, so the copy can say "below $0" in any currency.
 */
import { percentText } from './adapters/inputsV2';
import { divideHalfUp } from '../../money/rounding';
import { minorUnits, type MinorUnits } from '../../money/types';
import { minorFromBigInt, PERCENT_SCALE, type Percent } from '../../payoff/types';
import type { CashPathV3 } from './cash/path';
import { OVERDRAFT_DAYS_PER_YEAR, OVERDRAFT_REPEAT_MIN, OVERDRAFT_REPEAT_PAYDAYS } from './constants';
import { addDays } from './dates';
import type { CodeValues, Fact, ReadyBy, V3Account, Variant } from './types';

const FN = 'overdraft';

/** What the judge needs about overdrafts beyond the inputs: the floor and the two 90-day paths (05.4-13: one prepare). */
export interface OverdraftCtx {
  /** Minus the sum of the overdraft limits; 0 when no account has one. */
  readonly floor: MinorUnits;
  readonly withPurchase: CashPathV3;
  /** The same path with no purchase flows; null when the floor is 0 (no overdraft to cost). */
  readonly withoutPurchase: CashPathV3 | null;
  /** Pay dates after asOf inside the path, in order. */
  readonly paydays: readonly string[];
}

export interface OverdraftUse {
  /** How far below 0 at the deepest point (positive). */
  readonly below: MinorUnits;
  /** Days of the path below 0. */
  readonly days: number;
  /** Cost over the path with the purchase (an estimate). */
  readonly costEstimate: MinorUnits;
  /** The same without the purchase. */
  readonly without: MinorUnits;
  readonly withoutBelow: MinorUnits;
  readonly withoutDays: number;
  /** costEstimate - without (each already rounded). */
  readonly adds: MinorUnits;
  /** The next pay does not bring the account back to 0 or above (D-36). */
  readonly notCleared: boolean;
  /** The next pay date after asOf, or null when none lands inside the path. */
  readonly payDate: string | null;
}

/** A counted checking or current account: the only kind with an overdraft. */
function isOverdraftAccount(a: V3Account): boolean {
  return (a.kind === 'checking' || a.kind === 'current') && a.use !== null && (a.use.kind === 'everyday' || a.use.kind === 'mixed');
}

/** The limit as given; anything that is not a whole, non-negative amount counts as no limit (cautious). */
function limitOf(a: V3Account): number {
  const l = a.overdraftLimit;
  return l != null && Number.isSafeInteger(l) && l > 0 ? l : 0;
}

function accountsOf(accounts: readonly V3Account[] | undefined): readonly V3Account[] {
  return (accounts ?? []).filter(isOverdraftAccount);
}

/** D-28: minus the sum of the limits on counted checking and current accounts (a null limit is 0). */
export function overdraftFloor(accounts: readonly V3Account[] | undefined): MinorUnits {
  let sum = 0n;
  for (const a of accountsOf(accounts)) sum += BigInt(limitOf(a));
  return minorFromBigInt(-sum, FN);
}

/**
 * 06.1 CO-D-57: the overdraft not used yet, on its own line (never inside the other month figures): on each counted checking or
 * current account, its limit less the part already drawn (a balance below 0), never below 0.
 */
export function unusedOverdraftOf(accounts: readonly V3Account[] | undefined): MinorUnits {
  let sum = 0n;
  for (const a of accountsOf(accounts)) {
    const room = BigInt(limitOf(a)) - (a.balance < 0 ? BigInt(-a.balance) : 0n);
    if (room > 0n) sum += room;
  }
  return minorFromBigInt(sum, FN);
}

/** The account a purchase is paid from: the counted checking or current account holding the most (ties: the first). */
export function payerOf(accounts: readonly V3Account[] | undefined): V3Account | null {
  let best: V3Account | null = null;
  for (const a of accountsOf(accounts)) if (best === null || a.balance > best.balance) best = a;
  return best;
}

/** The account whose overdraft carries a dip: the payer when it has a limit, else the one with the largest limit. */
export function overdraftAccountOf(accounts: readonly V3Account[] | undefined): V3Account | null {
  const payer = payerOf(accounts);
  if (payer !== null && limitOf(payer) > 0) return payer;
  let best: V3Account | null = null;
  for (const a of accountsOf(accounts)) if (limitOf(a) > 0 && (best === null || limitOf(a) > limitOf(best))) best = a;
  return best;
}

/** D-38: the account to ask about when no limit is recorded: the payer if its limit is null, else the first with a null limit. */
export function noLimitAccountOf(accounts: readonly V3Account[] | undefined): V3Account | null {
  const payer = payerOf(accounts);
  if (payer !== null && payer.overdraftLimit == null) return payer;
  return accountsOf(accounts).find((a) => a.overdraftLimit == null) ?? null;
}

/** Yearly rate x amount / (100 x scale x periods), rounded half up once. */
function costAt(amount: bigint, rate: Percent, periods: number): MinorUnits {
  return minorFromBigInt(divideHalfUp(amount * rate, 100n * PERCENT_SCALE * BigInt(periods)), FN);
}

/** D-36: (sum over each day below 0 of how far below) x rate / 365, rounded half up. 0 with no rate. */
export function overdraftCost(path: CashPathV3, rate: Percent | null): MinorUnits {
  if (rate === null) return minorUnits(0);
  let sum = 0n;
  for (const p of path.points) if (p.balance < 0) sum -= BigInt(p.balance);
  return costAt(sum, rate, OVERDRAFT_DAYS_PER_YEAR);
}

/** Interest for one month on an amount below 0 (OD-08: 30000 at 20% = 500). */
export function monthlyOverdraftCost(below: MinorUnits, rate: Percent): MinorUnits {
  return costAt(BigInt(below), rate, 12);
}

function deepest(path: CashPathV3): number {
  let low = 0;
  for (const p of path.points) if (p.balance < low) low = p.balance;
  return 0 - low; // never -0
}

function daysBelow(path: CashPathV3): number {
  return path.points.filter((p) => p.balance < 0).length;
}

/**
 * The overdraft the purchase uses: deepest point, days below 0, the cost with and without it, and whether the next pay
 * clears it. null when the path with the purchase never goes below 0.
 */
export function overdraftUse(withPurchase: CashPathV3, withoutPurchase: CashPathV3, paydays: readonly string[], rate: Percent | null): OverdraftUse | null {
  const below = deepest(withPurchase);
  if (below === 0) return null;
  const costEstimate = overdraftCost(withPurchase, rate);
  const without = overdraftCost(withoutPurchase, rate);
  const payDate = paydays[0] ?? null;
  // With no pay inside the path, nothing clears it (cautious).
  const onPay = payDate === null ? undefined : withPurchase.points.find((p) => p.date === payDate);
  return {
    below: minorUnits(below),
    days: daysBelow(withPurchase),
    costEstimate,
    without,
    withoutBelow: minorUnits(deepest(withoutPurchase)),
    withoutDays: daysBelow(withoutPurchase),
    adds: minorUnits(costEstimate - without),
    notCleared: onPay === undefined || onPay.balance < 0,
    payDate,
  };
}

/** D-37: without the purchase, below 0 on the day before at least 2 of the next 3 paydays. null below the line. */
export function overdraftRepeat(withoutPurchase: CashPathV3, paydays: readonly string[]): { readonly count: number; readonly of: number } | null {
  const next = paydays.slice(0, OVERDRAFT_REPEAT_PAYDAYS);
  let count = 0;
  for (const d of next) {
    const before = withoutPurchase.points.find((p) => p.date === addDays(d, -1));
    if (before !== undefined && before.balance < 0) count++;
  }
  return count >= OVERDRAFT_REPEAT_MIN ? { count, of: OVERDRAFT_REPEAT_PAYDAYS } : null;
}

/**
 * Facts for a "Uses your overdraft" answer, and its variant (D-26, D-36, D-37). The not-cleared warning leads. `clears` is the
 * first month the purchase keeps the account at or above 0 (the judge's ready month), or null when it never does.
 */
export function overdraftUseFacts(
  accounts: readonly V3Account[] | undefined,
  ctx: OverdraftCtx,
  clears: Extract<ReadyBy, { kind: 'month' }> | null
): { readonly variant: Variant | null; readonly facts: readonly Fact[] } {
  const account = overdraftAccountOf(accounts) as V3Account; // the floor is below 0, so one account has a limit
  const without = ctx.withoutPurchase as CashPathV3; // set whenever the floor is below 0
  const rate = account.overdraftRate ?? null;
  const use = overdraftUse(ctx.withPurchase, without, ctx.paydays, rate) as OverdraftUse; // the judge only asks after a dip
  const repeat = overdraftRepeat(without, ctx.paydays);
  const zero = 0;
  // With no rate the cost is not counted: rate and cost are left out (copy variant _no_rate).
  const priced = (cost: MinorUnits): CodeValues => (rate === null ? {} : { rate: percentText(rate), cost });
  const facts: Fact[] = [];
  if (use.notCleared) {
    facts.push({ code: 'overdraft_not_cleared', values: { accountId: account.id, ...(use.payDate === null ? {} : { date: use.payDate }), below: belowOn(ctx.withPurchase, use.payDate), zero } });
  }
  facts.push({ code: 'overdraft_use', values: { accountId: account.id, below: use.below, days: use.days, ...priced(use.costEstimate), zero } });
  if (use.notCleared && rate !== null) facts.push({ code: 'overdraft_cost_90d', values: { rate: percentText(rate), cost: use.costEstimate, zero } });
  if (use.notCleared && clears !== null) facts.push({ code: 'wait_clears', values: { month: clears.month, zero } });
  if (rate !== null) {
    facts.push({ code: 'overdraft_without_purchase', values: { below: use.withoutBelow, days: use.withoutDays, cost: use.without, zero } });
    facts.push({ code: 'overdraft_purchase_adds', values: { cost: use.adds } });
  }
  if (repeat !== null) {
    facts.push({ code: 'overdraft_repeat', values: { accountId: account.id, count: repeat.count, of: repeat.of, ...priced(use.without), zero } });
  }
  return { variant: use.notCleared ? 'not_cleared' : null, facts };
}

/** How far below 0 the account is on the pay date (after the pay), or at the end of the path with no pay inside it. */
function belowOn(path: CashPathV3, date: string | null): MinorUnits {
  const p = (date === null ? undefined : path.points.find((x) => x.date === date)) ?? (path.points[path.points.length - 1] as CashPathV3['points'][number]);
  return minorUnits(-p.balance);
}

/**
 * D-28, D-38: below 0 with no limit recorded is Not yet; the answer says so and asks whether the account has an overdraft.
 * clearing_first when the account is already below 0; ready_without_interest when a ready date is given and no rate is set.
 * [] when every counted checking or current account has a limit recorded (an explicit 0 is an answer, not a gap).
 */
export function noLimitFacts(accounts: readonly V3Account[] | undefined, below: MinorUnits, readyBy: ReadyBy | null): readonly Fact[] {
  const account = noLimitAccountOf(accounts);
  if (account === null) return [];
  const facts: Fact[] = [{ code: 'no_overdraft_limit', values: { accountId: account.id, below, zero: 0 } }];
  if (account.balance < 0) facts.push({ code: 'clearing_first', values: { zero: 0 } });
  if (readyBy !== null && account.overdraftRate == null) facts.push({ code: 'ready_without_interest', values: {} });
  return facts;
}

/**
 * OD-08: another counted checking or current account already below 0 that the purchase is not paid from. A fact only; it
 * never changes the code. Adding balances together would hide a live overdraft, so it is said.
 */
export function otherOverdrawnFacts(accounts: readonly V3Account[] | undefined): readonly Fact[] {
  const payer = payerOf(accounts);
  const facts: Fact[] = [];
  for (const a of accountsOf(accounts)) {
    if (a === payer || a.balance >= 0) continue;
    const below = minorUnits(-a.balance);
    const rate = a.overdraftRate ?? null;
    facts.push({
      code: 'other_account_overdrawn',
      values: { accountId: a.id, below, ...(rate === null ? {} : { rate: percentText(rate), monthlyCost: monthlyOverdraftCost(below, rate) }), zero: 0 },
    });
  }
  return facts;
}
