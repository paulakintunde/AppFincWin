/**
 * 05.3-22: "How this was worked out". Pure view-model over the engine month. Only integer adds of engine minor
 * units (bigint, back through minorUnits); no rates, no division. The month rows sum to MonthModel.monthLeft by
 * construction: moneyIn - (regular + loans + saving + everydaySoFar + toCome) = monthLeft.
 */
import type { Evaluation, V3Inputs, V3Month, YearMonth } from '@/engine/decide/v3';
import { minorUnits, type MinorUnits } from '@/engine/money';

export interface WorkedRow {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly amount: MinorUnits;
  readonly deduct: boolean;
}
export type SixState = 'normal' | 'half' | 'out';
export interface WorkedModel {
  readonly rows: readonly WorkedRow[];
  readonly result: { readonly month: YearMonth; readonly amount: MinorUnits; readonly negative: boolean };
  readonly six: readonly { readonly month: YearMonth; readonly left: MinorUnits; readonly state: SixState }[];
  readonly typical: MinorUnits | null;
  readonly basedOn: number;
  readonly largest: { readonly month: YearMonth; readonly amount: MinorUnits } | null;
  readonly regular: readonly { readonly name: string; readonly day: number; readonly amount: MinorUnits; readonly confirmed: boolean }[];
  readonly regularEmpty: boolean;
}

const K = 'decide.v3.ui.worked.';
const IN_ROLES: ReadonlySet<string> = new Set(['income', 'other_in', 'refund']);
const OUT_ROLES: ReadonlySet<string> = new Set(['spending', 'debt_payment', 'saved_invested', 'other_out']);

const abs = (x: number): bigint => BigInt(Math.abs(x));

/** Fallback per-month left: paid money in less paid money out, integer adds of the logged lines. */
function monthLeftOf(m: V3Month): MinorUnits {
  let total = 0n;
  for (const l of m.lines) {
    if (l.status !== 'paid') continue;
    if (IN_ROLES.has(l.role)) total += abs(l.amount);
    else if (OUT_ROLES.has(l.role)) total -= abs(l.amount);
  }
  return minorUnits(Number(total));
}

export function workedModel(
  ev: Pick<Evaluation, 'month'>,
  inputs: V3Inputs,
  names: Readonly<Record<string, string>> = {},
): WorkedModel {
  const m = ev.month;

  // Loan minimums are inside setAside (month/model.ts setAsideOf); the rest of setAside is saving.
  let debts = 0n;
  for (const d of inputs.debts) debts += BigInt(d.minimum);
  const setAside = BigInt(m.setAside);
  const loans = debts > setAside ? setAside : debts;
  const saving = setAside - loans;
  const regularTotal = BigInt(m.billsPaid) + BigInt(m.billsDue);

  const bills = inputs.series.filter((s) => s.role === 'bill' && s.status !== 'dismissed');
  const confirmedBills = bills.filter((s) => s.confirmed);
  const pay = inputs.series.find((s) => s.role === 'pay' && s.confirmed && s.status !== 'dismissed');
  const daysLeft = m.daysInMonth - m.day;

  const rows: WorkedRow[] = [
    { key: `${K}pay`, params: { date: pay === undefined ? '' : pay.anchorDate }, amount: m.moneyIn, deduct: false },
    {
      key: `${K}regular_${confirmedBills.length === 1 ? 'one' : 'other'}`,
      params: { count: confirmedBills.length },
      amount: minorUnits(Number(regularTotal)),
      deduct: true,
    },
    { key: `${K}loans`, params: {}, amount: minorUnits(Number(loans)), deduct: true },
    { key: `${K}saving`, params: {}, amount: minorUnits(Number(saving)), deduct: true },
    { key: `${K}everydaySoFar`, params: {}, amount: m.everydayLogged, deduct: true },
    {
      key: `${K}toCome_${daysLeft === 1 ? 'one' : 'other'}`,
      params: { count: daysLeft },
      amount: m.erest,
      deduct: true,
    },
  ];

  const pictureLeft = new Map<string, MinorUnits>();
  for (const pm of m.incomePicture?.months ?? []) pictureLeft.set(pm.month, pm.left);
  const underLogged = new Set<string>();
  for (const n of m.notices) {
    if (n.code === 'month_looks_under_logged') underLogged.add(String(n.values['month']));
  }
  const used = new Set<string>(m.monthsUsed);
  const past = inputs.months
    .filter((x) => x.full && x.month < m.month)
    .slice()
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .slice(-6);
  const six = past.map((x) => ({
    month: x.month,
    left: pictureLeft.get(x.month) ?? monthLeftOf(x),
    state: (used.has(x.month) ? 'normal' : x.mark === 'half' || underLogged.has(x.month) ? 'half' : 'out') as SixState,
  }));

  let largest: { month: YearMonth; amount: MinorUnits } | null = null;
  if (m.monthsUsed.length >= 3) {
    for (const s of six) {
      if (s.state === 'normal' && (largest === null || s.left > largest.amount)) largest = { month: s.month, amount: s.left };
    }
  }

  const regular = bills.map((s) => ({
    name: names[s.id] ?? s.id,
    day: Number(s.anchorDate.slice(8, 10)),
    amount: s.amount,
    confirmed: s.confirmed,
  }));

  return {
    rows,
    result: { month: m.month, amount: m.monthLeft, negative: m.monthLeft < 0 },
    six,
    typical: m.typicalLeft,
    basedOn: six.length,
    largest,
    regular,
    regularEmpty: confirmedBills.length === 0,
  };
}
