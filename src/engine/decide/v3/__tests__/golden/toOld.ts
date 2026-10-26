/**
 * Shadow baseline adapter (05.1 S0, D-14). Imports the old test builders; deleted with the old engine at cutover (D-16).
 *
 * Converts a v3 fixture person and purchase into the old engine's DecideSnapshot / PurchaseCheck and runs `assess`.
 * Anything the old engine cannot express is returned as 'unsupported' with a reason, never guessed.
 * Not carried over (the old engine has no field for them): the emergency fund (its cushion is derived), unspent anchor,
 * rough figures, income profile, limit lines and the purchase's emergency / envelope flags.
 */
import { minorUnits, type CurrencyCode, type MinorUnits } from '../../../../money/types';
import { PERCENT_SCALE, percent } from '../../../../payoff/types';
import { assess } from '../../../assess';
import { monthlyEquivalent } from '../../../series';
import type {
  BuyCheck,
  BuyPayment,
  DebtRecord,
  DecideSnapshot,
  InstalmentFreq,
  MonthRecord,
  PurchaseCheck,
  RecordLine,
  RecurringBill,
  RecurringFreq,
  RecurringIncome,
} from '../../../types';
import { bill, buyCash, income, line, snapshotOf, USD } from '../../../__tests__/helpers/fixtures';
import type { Cadence } from '../../types';
import type { FixtureLine, FixturePerson, FixturePurchase, FixtureSeries } from './adapter';

export type OldAnswer =
  | { readonly state: 'fits' | 'adjust' | 'no' | 'missing'; readonly basis: 'month' | 'average' }
  | { readonly state: 'unsupported'; readonly reason: string };

const TRANSFER_ROLES: ReadonlySet<string> = new Set([
  'own_transfer',
  'envelope_deposit',
  'envelope_withdrawal',
  'emergency_move',
  'saved_invested',
]);
const IN_ROLES: ReadonlySet<string> = new Set(['income', 'refund', 'other_in']);

function freqOf(c: Cadence): RecurringFreq | null {
  if (c.unit === 'week' && c.every === 1) return 'weekly';
  if (c.unit === 'week' && c.every === 2) return 'fortnightly';
  if (c.unit === 'month' && c.every === 1) return 'monthly';
  if (c.unit === 'month' && c.every === 3) return 'quarterly';
  if (c.unit === 'month' && c.every === 12) return 'yearly';
  return null;
}

/** A series the old engine can see: confirmed and live (ended and dismissed series are the builder's omissions). */
function counted(s: FixtureSeries): boolean {
  return (s.confirmed ?? true) && (s.status ?? 'live') === 'live';
}

function oldLine(l: FixtureLine, month: string, seriesOk: ReadonlySet<string>): RecordLine | null {
  if (l.role === 'debt_payment') return null; // debts[].minimumPayment carries it
  const direction = IN_ROLES.has(l.role) ? 'in' : 'out';
  return line({
    id: l.id,
    date: l.date.startsWith(month) ? l.date : `${month}-15`,
    direction,
    amount: l.amount,
    status: l.status === 'pending' ? 'pending' : 'paid',
    isRefund: l.role === 'refund',
    transferId: TRANSFER_ROLES.has(l.role) ? l.id : null,
    seriesId: l.seriesId && seriesOk.has(l.seriesId) ? l.seriesId : null,
    categoryId: l.categoryId ?? null,
  });
}

export function toOldSnapshot(person: FixturePerson, basis: 'month' | 'average'): DecideSnapshot {
  const seriesOk = new Set(person.series.filter(counted).map((s) => s.id));
  const months: MonthRecord[] = person.months.map((m) => ({
    month: m.month,
    full: m.full ?? true,
    lines: m.lines.flatMap((l) => {
      const o = oldLine(l, m.month, seriesOk);
      return o ? [o] : [];
    }),
  }));
  const bills: RecurringBill[] = [];
  const incomeSeries: RecurringIncome[] = [];
  let monthlySaving = 0;
  let housingMonthly = 0;
  for (const s of person.series.filter(counted)) {
    const freq = freqOf(s.cadence);
    if (freq === null) continue; // omitted: no old-engine cadence
    const monthly = Number(monthlyEquivalent(minorUnits(s.amount), freq));
    if (s.role === 'bill') {
      bills.push(
        bill({
          seriesId: s.id,
          freq,
          anchorDate: s.anchorDate,
          endDate: s.endDate ?? null,
          latestAmount: s.amount,
          categoryId: s.categoryId ?? null,
        })
      );
      if (s.isHousing) housingMonthly += monthly;
    } else if (s.role === 'pay') {
      incomeSeries.push(income({ seriesId: s.id, freq, anchorDate: s.anchorDate, endDate: s.endDate ?? null, latestAmount: s.amount }));
    } else if (s.role === 'saving' && s.savingMode === 'fixed') {
      monthlySaving += monthly;
    }
  }
  const debts: DebtRecord[] = person.debts.map((d) => ({
    id: d.id,
    balance: minorUnits(d.balance),
    minimumPayment: minorUnits(d.minimum),
    secured: d.secured,
    apr: d.aprText === null ? null : percent(d.aprText),
    currency: USD,
  }));
  for (const d of person.debts) if (d.isHousing) housingMonthly += d.minimum;
  return snapshotOf({
    asOf: person.asOf,
    months,
    bills,
    incomeSeries,
    basisOverride: basis,
    cashOnHand: minorUnits(person.balance),
    debts,
    monthlySaving: minorUnits(monthlySaving),
    housingMonthly: minorUnits(housingMonthly),
    pots: person.envelopes.map((e) => ({
      id: e.id,
      kind: e.kind,
      target: e.target,
      monthlyAmount: e.monthlyAmount,
      readyBy: e.readyBy,
      saved: e.saved,
    })),
  });
}

function taxOf(price: number, taxPercent: string | null): number {
  if (taxPercent === null) return 0;
  const num = BigInt(price) * BigInt(percent(taxPercent));
  const den = 100n * PERCENT_SCALE;
  return Number((2n * num + den) / (2n * den)); // half up
}

const INSTALMENT_FREQ: Record<string, InstalmentFreq> = { weekly: 'weekly', fortnightly: 'fortnightly', monthly: 'monthly', quarterly: 'quarterly' };

export function toOldCheck(p: FixturePurchase, currency: CurrencyCode): PurchaseCheck | { readonly unsupported: string } {
  if (p.foreign !== null) return { unsupported: 'foreign_currency_not_in_v1' };
  if (p.price === null) return { unsupported: 'no_price' };
  if (Object.keys(p.extras).length > 0) return { unsupported: 'extras_not_in_v1' };
  const total = p.price + taxOf(p.price, p.taxPercent) + p.oneOffFees;
  const base: Partial<BuyCheck> = { currency, itemType: p.itemType === 'vehicle' ? 'vehicle' : 'general' };
  if (p.pay.mode === 'once') return buyCash(total, base);
  const plan = p.pay;
  const freq = (() => {
    const f = freqOf(plan.cadence);
    return f === null ? null : INSTALMENT_FREQ[f] ?? null;
  })();
  const count = plan.count ?? plan.termMonths;
  if (plan.firstPayment?.kind === 'deferred') return { unsupported: 'cadence_or_start_not_in_v1' };
  if (freq === null) return { unsupported: 'cadence_or_start_not_in_v1' };
  const apr = plan.aprText === null ? null : percent(plan.aprText);
  const interest = apr !== null && BigInt(apr) > 0n;
  let payment: BuyPayment;
  if (plan.cadence.unit === 'month' && plan.cadence.every === 1 && interest) {
    payment = { method: 'loan', deposit: minorUnits(plan.deposit), termMonths: count, apr };
  } else {
    if (plan.deposit > 0 || plan.tradeIn > 0) return { unsupported: 'deposit_with_instalment_not_in_v1' };
    if (plan.fees.setup > 0 || plan.fees.perPeriod > 0 || plan.fees.end > 0) return { unsupported: 'plan_fees_not_in_v1' };
    if (count === null || count <= 0) return { unsupported: 'plan_count_missing' };
    const amount: MinorUnits = plan.quotedPayment !== null ? minorUnits(plan.quotedPayment) : minorUnits(Math.round(total / count));
    payment = {
      method: 'instalment',
      instalmentAmount: amount,
      instalmentCount: count,
      freq,
      ...(plan.firstPayment === null ? {} : { firstPayment: plan.firstPayment.kind === 'today' ? ('today' as const) : ('next_period' as const) }),
    };
  }
  return buyCash(total, { ...base, payment });
}

export function oldAnswer(person: FixturePerson, p: FixturePurchase, basis: 'month' | 'average'): OldAnswer {
  try {
    const check = toOldCheck(p, USD);
    if ('unsupported' in check) return { state: 'unsupported', reason: check.unsupported };
    let snapshot = toOldSnapshot(person, basis);
    if (p.share !== 'personal') {
      snapshot = {
        ...snapshot,
        scope: { kind: 'household', memberCount: p.share.members, myIndex: 0, rule: { kind: p.share.rule } },
        householdSpending: { rule: { kind: p.share.rule }, byCategory: [] },
      };
    }
    const verdict = assess(snapshot, check);
    return { state: verdict.state, basis };
  } catch (e) {
    return { state: 'unsupported', reason: 'old_engine_threw:' + (e instanceof Error ? e.message : String(e)) };
  }
}
