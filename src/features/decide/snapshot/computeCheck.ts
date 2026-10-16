/**
 * 05-07: PURE. JSON inputs in (no bigint stored), engine objects out (memory only, D-15). Barrel imports only.
 *
 * Everything a Decide screen shows is computed here from the stored inputs and the current snapshot, every time, and
 * never stored (D-15). `decide()` is called once per computation; options, alternatives, setbacks and the wait plan read
 * `decision.verdict` (the combined position) and its context, never a separate context call. The home list uses
 * the cheaper `assess()` through computeChip. The quick check and the full check share one path, so their chips cannot
 * disagree (D-01).
 */
import {
  amortiseSchedule,
  simulateMinimumSchedule,
} from '@/engine/payoff';
import {
  applySetbacks,
  assess,
  buildAlternatives,
  buildOptions,
  buildWaitPlan,
  decide,
  firstRead,
  incomeAtRisk,
  investmentViews,
  percent,
  rateScheduleFor,
  resolvePlan,
  runningCostPrompts,
} from '@/engine/decide';
import type {
  BuyCheck,
  BuyPayment,
  DecideSnapshot,
  MinorUnits,
  PlanResult,
  PurchaseCheck,
  SetbackInput,
  StackedCheckInput,
} from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { PAY_METHODS } from './types';
import { effectiveMethod, quickToCheckInputs, toEngineCheck } from './checkInputs';
import type { EngineCheckResult, EngineCtx } from './checkInputs';
import type { CheckComputation, CheckInputs, ChipComputation, MethodKey, QuickComputation, QuickInputs, SetbackLine, SnapshotResult } from './types';

type EngineOk = Extract<EngineCheckResult, { ok: true }>;

/** The computation before the slow detail figures: what the verdict card, warnings and step 2 read (D-56). */
export type CheckCore = CheckComputation & { readonly inputs: CheckInputs };

const ctxOf = (source: SnapshotResult): EngineCtx => ({ currency: source.currency, cards: source.cards, dealerCap: source.dealerCap });

// D-31 / 04 D-51: the check's one rate list is the engine's projectionRates; the first is the single projectionReturn.
const ratedSnapshots = new WeakMap<DecideSnapshot, Map<string, DecideSnapshot>>();
function snapshotWithRates(snapshot: DecideSnapshot, rates: readonly string[]): DecideSnapshot {
  const key = rates.join('|');
  let byKey = ratedSnapshots.get(snapshot);
  if (byKey === undefined) {
    byKey = new Map();
    ratedSnapshots.set(snapshot, byKey);
  }
  let rated = byKey.get(key);
  if (rated === undefined) {
    const first = rates[0];
    rated = { ...snapshot, projectionRates: rates.map(percent), projectionReturn: first === undefined ? null : percent(first) };
    byKey.set(key, rated);
  }
  return rated;
}

function toSetbackInput(l: SetbackLine): SetbackInput {
  switch (l.code) {
    case 'unexpected_expense':
      return { code: l.code, enabled: l.enabled, amount: l.amount === null ? null : minorUnits(l.amount) };
    case 'income_drop':
      return { code: l.code, enabled: l.enabled, percentDrop: l.percentDrop, months: l.months };
    case 'job_loss':
      return { code: l.code, enabled: l.enabled, months: l.months };
    case 'late_invoice':
      return { code: l.code, enabled: l.enabled, daysLate: l.daysLate };
  }
}

const NO_FIGURES = {
  check: null,
  resolvedPrice: null,
  running: null,
  methodPlans: {},
  decision: null,
  verdict: null,
  firstRead: null,
  context: null,
  options: [],
  alternatives: null,
  setbacks: null,
  waitPlan: null,
  unconverted: null,
  investmentViews: null,
  incomeAtRisk: null,
  promoBalanceAtEnd: {},
} as const;

// D-52: "Left when it ends" has no engine field; it is read from the same schedule the engine's plan used.
function promoBalances(checks: Partial<Record<MethodKey, PurchaseCheck>>, plans: Partial<Record<MethodKey, PlanResult>>): CheckComputation['promoBalanceAtEnd'] {
  const out: { loan?: MinorUnits; card?: MinorUnits } = {};
  const loanPlan = plans.loan!;
  if (loanPlan.status === 'resolved' && loanPlan.plan.promo !== null) {
    const pay = (checks.loan as BuyCheck).payment as Extract<BuyPayment, { method: 'loan' }>;
    out.loan = amortiseSchedule(loanPlan.plan.financed, rateScheduleFor(pay.apr!, pay.promo), pay.termMonths!).balanceAtPromoEnd;
  }
  const cardPlan = plans.card!;
  if (cardPlan.status === 'resolved' && cardPlan.plan.promo !== null) {
    const pay = (checks.card as BuyCheck).payment as Extract<BuyPayment, { method: 'card' }>;
    const onCard = cardPlan.plan.card!.onCard;
    const schedule = rateScheduleFor(pay.card!.apr!, pay.promo);
    if (pay.payoff.kind === 'months') {
      out.card = amortiseSchedule(onCard, schedule, pay.payoff.months).balanceAtPromoEnd;
    } else {
      const s = simulateMinimumSchedule(onCard, schedule, pay.card!.minimumTerms!);
      // the simulation stops early only when it clears (or never clears), so a missing month is 0 or what remains
      out.card = s.balancesByMonth[cardPlan.plan.promo.promoMonths - 1] ?? (s.outcome === 'cleared' ? minorUnits(0) : s.remainingBalance);
    }
  }
  return out;
}

/** The core of a full check: status, the engine check, the method plans and the verdict. No options or projections. */
export function computeCore(source: SnapshotResult, inputs: CheckInputs, otherChecks: readonly StackedCheckInput[] = []): CheckCore {
  const prompts = inputs.kind === 'buy' ? runningCostPrompts(inputs.itemType) : [];
  const ctx = ctxOf(source);
  const r = toEngineCheck(inputs, ctx);
  if (!r.ok) return { ...NO_FIGURES, status: 'incomplete', missingInput: r.missing, runningCostPrompts: prompts, inputs };

  const methods: readonly MethodKey[] = inputs.kind === 'buy' ? PAY_METHODS : ['lump', 'monthly'];
  const checks: Partial<Record<MethodKey, PurchaseCheck>> = {};
  const methodPlans: Partial<Record<MethodKey, PlanResult>> = {};
  for (const m of methods) {
    // each method is built from the same inputs and resolved on its own; the price is already known to be valid
    checks[m] = (toEngineCheck({ ...inputs, method: m }, ctx) as EngineOk).check;
    methodPlans[m] = resolvePlan(checks[m]);
  }
  const base = {
    ...NO_FIGURES,
    missingInput: null,
    check: r.check,
    resolvedPrice: r.resolvedPrice,
    running: r.running,
    methodPlans,
    promoBalanceAtEnd: inputs.kind === 'buy' ? promoBalances(checks, methodPlans) : {},
    runningCostPrompts: prompts,
    inputs,
  };

  // D-37: an amount with no stored rate gives no figure anywhere
  if (source.unconverted !== null) return { ...base, status: 'unconverted', unconverted: source.unconverted };

  switch (source.kind) {
    case 'logged': {
      const decision = decide(snapshotWithRates(source.snapshot, inputs.projectionRates), r.check, inputs.combine === false ? [] : otherChecks);
      const verdict = decision.verdict;
      return { ...base, status: 'logged', decision, verdict, context: verdict.state === 'missing' ? null : verdict.context };
    }
    case 'rough':
      return { ...base, status: 'first_read', firstRead: firstRead(source.figures, r.check) };
    case 'none':
      return { ...base, status: 'none' };
  }
}

/** The slow figures, from the core's combined verdict and context: options, alternatives, setbacks, wait plan, views. */
export function computeDetails(core: CheckCore, inputs: CheckInputs): CheckComputation {
  const { inputs: _inputs, ...base } = core;
  const { verdict, check } = core;
  if (verdict === null || verdict.state === 'missing' || check === null) return base;
  const context = verdict.context;
  const setbacks = inputs.setbacks.map(toSetbackInput);
  const buyer = check.kind === 'buy';
  return {
    ...base,
    options: buildOptions(context, check, verdict),
    alternatives: buildAlternatives(context, check, verdict, inputs.cheaperRatioPercent ?? undefined),
    setbacks: applySetbacks(verdict, setbacks),
    waitPlan: buildWaitPlan(context, check, inputs.wait.monthlyAmount === null ? null : minorUnits(inputs.wait.monthlyAmount)),
    investmentViews: buyer
      ? investmentViews(context, check, verdict, {
          horizonMonths: inputs.investHorizonMonths,
          holdingFee: inputs.investHoldingFeeText === null ? null : percent(inputs.investHoldingFeeText),
        })
      : null,
    incomeAtRisk: buyer ? incomeAtRisk(context, verdict, setbacks) : null,
  };
}

/** The full computation every Decide screen renders. */
export function computeCheck(source: SnapshotResult, inputs: CheckInputs, otherChecks: readonly StackedCheckInput[] = []): CheckComputation {
  return computeDetails(computeCore(source, inputs, otherChecks), inputs);
}

/** The quick check (home, onboarding): the same engine path as the full check for the same inputs (D-01). */
export function computeQuick(
  source: SnapshotResult,
  q: QuickInputs,
  opts: { allowCashOnly: boolean; otherChecks?: readonly StackedCheckInput[] }
): QuickComputation {
  const r = toEngineCheck(quickToCheckInputs(q, ''), ctxOf(source));
  if (!r.ok) return { kind: 'incomplete' };
  if (source.unconverted !== null) return { kind: 'unconverted', currencies: source.unconverted.currencies };
  const check = r.check as BuyCheck;
  const { resolvedPrice } = r;
  switch (source.kind) {
    case 'logged': {
      const decision = decide(snapshotWithRates(source.snapshot, []), check, opts.otherChecks ?? []);
      return { kind: 'logged', decision, verdict: decision.verdict, check, resolvedPrice };
    }
    case 'rough':
      return { kind: 'first_read', firstRead: firstRead(source.figures, check), check, resolvedPrice };
    case 'none': {
      // D-03, D-04, DCU-10: no figures to judge against. Only the onboarding skip path shows the plain cash arithmetic,
      // with no cushion, no state and no month claim.
      if (!opts.allowCashOnly) return { kind: 'none' };
      const resolved = resolvePlan(check);
      if (resolved.status === 'missing') return { kind: 'none' };
      const { plan } = resolved;
      const credit = q.mode === 'credit';
      return {
        kind: 'cash_only',
        check,
        resolvedPrice,
        dayOne: plan.dayOne,
        cashAfter: minorUnits(source.cash - plan.dayOne),
        monthly: credit ? plan.monthly : null,
        termMonths: credit ? q.termMonths : null,
        months: credit ? plan.months : null,
      };
    }
  }
}

/** The home open-checks chip: the cheaper assess() entry, so it always agrees with the step-3 chip (D-24, 05-21). */
export function computeChip(source: SnapshotResult, inputs: CheckInputs, otherChecks: readonly StackedCheckInput[] = []): ChipComputation {
  const r = toEngineCheck(inputs, ctxOf(source));
  if (!r.ok) return { status: 'incomplete', missingInput: r.missing, price: inputs.advertised === null ? null : minorUnits(inputs.advertised) };
  const method = effectiveMethod(inputs) as MethodKey;
  const price = r.resolvedPrice.price;
  if (source.unconverted !== null) return { status: 'unconverted', price, method };
  switch (source.kind) {
    case 'logged': {
      const v = assess(snapshotWithRates(source.snapshot, inputs.projectionRates), r.check, inputs.combine === false ? [] : otherChecks);
      return { status: 'logged', state: v.state, price, method, left: v.state === 'missing' ? null : v.left };
    }
    case 'rough': {
      const fr = firstRead(source.figures, r.check);
      return { status: 'first_read', state: fr.state, price, method, left: fr.state === 'missing' ? null : fr.leftAfter };
    }
    case 'none':
      return { status: 'none', price, method };
  }
}
