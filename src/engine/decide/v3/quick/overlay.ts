/**
 * 06.1 D-21: quick-estimate lines for ONE check. Pure; integer minor units; no clock (asOf is an input); nothing in the inputs or
 * the check is mutated, and nothing here reaches a record.
 *
 * withQuickLines folds each line into a copy of the inputs and the check:
 * - expense every 1, 3 or 12 months: a running cost from its date (or today), counted in the usual month and on its own dates.
 * - expense once: one bill on its date (today when it has none or it is past), left out of the usual month. (Not a 12-month running
 *   cost: that would also put a twelfth of a one-time cost into the usual month, and into the monthly amount of a one-off.)
 * - loan: a recorded loan whose minimum is `monthly`, due on the day of `firstDate` (null = a month from today), owing `monthly` x the
 *   payments still to come, so the minimum stops after the last one (the same rule as any loan). A first date already past moves on a
 *   month at a time and uses up one payment each. A first date more than a month away counts from the next time its day comes round.
 * - income every month: a pay of `amount` a month from the first date after today; income once: one pay on its date. A date today
 *   or earlier counts from tomorrow (the money is never counted before it is sure to be there).
 * - savings the user said answers can use: spare money, as an unlocked goal kept in its own untouched savings account
 *   (spareSavings reads it the same way as any unlocked goal outside the spending accounts, 06 D-22). Not usable: counted nowhere.
 * A line with no positive amount (or a loan with no payments) counts nowhere and is not in the count.
 *
 * judgeWithQuickLines re-prepares the folded inputs for this check only. With no quick lines it is judgeCheck, unchanged. It adds
 * quick_lines_counted (and quick_savings_counted) after the engine's own facts, before free_help.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { addDays, addMonthsClamped, isValidLocalDate, yearMonthOf } from '../dates';
import { judgeCheck, prepare, type Evaluation, type Prepared } from '../prepare';
import type { CheckV2, Envelope, Fact, LocalDate, QuickLine, RunningCostLine, V3Account, V3Debt, V3Inputs, V3Series } from '../types';

const PREFIX = 'q:';

export interface QuickOverlay {
  readonly inputs: V3Inputs;
  readonly check: CheckV2;
  /** How many lines count. */
  readonly counted: number;
  /** The usable savings counted as spare money. */
  readonly savings: MinorUnits;
}

const positive = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
const validDate = (d: LocalDate | null): d is LocalDate => d !== null && isValidLocalDate(d);

/** The first occurrence on or after `from`, stepping `every` months from `start`; and how many steps that took. */
function rollForward(start: LocalDate, every: number, from: LocalDate): { readonly date: LocalDate; readonly steps: number } {
  let steps = 0;
  while (addMonthsClamped(start, steps * every) < from) steps += 1;
  return { date: addMonthsClamped(start, steps * every), steps };
}

function series(id: string, name: string, role: 'bill' | 'pay', amount: MinorUnits, anchorDate: LocalDate, endDate: LocalDate | null, typical: 'monthly' | 'excluded'): V3Series {
  // A one-time line is a 12-month cadence that ends on its own date: the usual month only reads a typical choice on a cadence longer than a month.
  return {
    id: PREFIX + id,
    name,
    role,
    cadence: { unit: 'month', every: typical === 'excluded' ? 12 : 1 },
    anchorDate,
    endDate,
    amount,
    status: 'live',
    confirmed: true,
    payGroup: null,
    countsAs: null,
    incomeKind: null,
    typicalChoice: typical,
    categoryId: null,
    isHousing: false,
    savingMode: null,
  };
}

interface Folded {
  readonly running: RunningCostLine[];
  readonly series: V3Series[];
  readonly accounts: V3Account[];
  readonly goals: Envelope[];
  readonly debts: V3Debt[];
  /** Income landing later this month, which the unspent money of this month also counts (as pay still to arrive is). */
  arriving: number;
}

/** The inputs and check with this check's quick lines folded in. */
export function withQuickLines(inputs: V3Inputs, check: CheckV2): QuickOverlay {
  const { quickLines, ...rest } = check;
  const acc: Folded = { running: [], series: [], accounts: [], goals: [], debts: [], arriving: 0 };
  let counted = 0;
  for (const line of quickLines ?? []) counted += foldLine(line, inputs.asOf, acc);
  if (counted === 0) return { inputs, check: { ...rest }, counted: 0, savings: minorUnits(0) };
  // No accounts given = the balance is the spending balance, so it stands in as one everyday account (the fund, which is then
  // taken off an account as it is for any inputs with accounts, is added back so the spending balance stays what it was).
  const standIn: V3Account = { id: PREFIX + 'spending', balance: minorUnits(inputs.balance + (inputs.emergency?.amount ?? 0)), use: { kind: 'everyday' }, kind: 'checking' };
  const accounts = acc.accounts.length === 0 ? inputs.accounts : [...(inputs.accounts ?? [standIn]), ...acc.accounts];
  return {
    inputs: { ...inputs, unspent: inputs.unspent === null ? null : { ...inputs.unspent, amount: minorUnits(inputs.unspent.amount + acc.arriving) }, series: [...inputs.series, ...acc.series], accounts, envelopes: [...inputs.envelopes, ...acc.goals], debts: [...inputs.debts, ...acc.debts] },
    check: { ...rest, runningCosts: [...(rest.runningCosts ?? []), ...acc.running] },
    counted,
    savings: minorUnits(acc.goals.reduce((t, g) => t + g.saved, 0)),
  };
}

const inThisMonth = (date: LocalDate, asOf: LocalDate): boolean => yearMonthOf(date) === yearMonthOf(asOf);

/** Folds one line in; 1 when it counts, else 0. */
function foldLine(line: QuickLine, asOf: LocalDate, acc: Folded): 0 | 1 {
  const dated = (d: LocalDate | null): LocalDate | null => (validDate(d) ? d : null);
  switch (line.kind) {
    case 'expense': {
      if (!positive(line.amount)) return 0;
      const date = dated(line.date);
      if (line.everyMonths === 0) {
        const on = date !== null && date > asOf ? date : asOf;
        acc.series.push(series(line.id, line.name, 'bill', line.amount, on, on, 'excluded'));
      } else {
        acc.running.push({ id: PREFIX + line.id, amount: line.amount, everyMonths: line.everyMonths, start: date ?? asOf, end: null, on: true });
      }
      return 1;
    }
    case 'loan': {
      if (!positive(line.monthly) || !Number.isInteger(line.payments) || line.payments < 1) return 0;
      const rolled = rollForward(dated(line.firstDate) ?? addMonthsClamped(asOf, 1), 1, asOf);
      const owed = line.monthly * (line.payments - rolled.steps);
      if (!positive(owed)) return 0;
      acc.debts.push({ id: PREFIX + line.id, kind: 'loan', balance: minorUnits(owed), minimum: line.monthly, apr: null, secured: false, isHousing: false, dueDay: Number(rolled.date.slice(8, 10)), joint: false });
      return 1;
    }
    case 'income': {
      if (!positive(line.amount)) return 0;
      const from = addDays(asOf, 1);
      const date = dated(line.date) ?? from;
      if (line.everyMonths === 0) {
        const on = date < from ? from : date;
        acc.series.push(series(line.id, line.name, 'pay', line.amount, on, on, 'excluded'));
        if (inThisMonth(on, asOf)) acc.arriving += line.amount;
      } else {
        const first = rollForward(date, 1, from).date;
        acc.series.push(series(line.id, line.name, 'pay', line.amount, first, null, 'monthly'));
        if (inThisMonth(first, asOf)) acc.arriving += line.amount;
      }
      return 1;
    }
    case 'savings': {
      if (!line.usable || !positive(line.amount)) return 0;
      const id = PREFIX + line.id;
      acc.accounts.push({ id, balance: line.amount, use: { kind: 'untouched' }, kind: 'savings' });
      acc.goals.push({ id, kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: line.amount, purposeId: null, accountId: id, locked: false });
      return 1;
    }
  }
}

/** The facts with the quick-line facts put before free_help, and the unlocked-goals fact leaving out the quick savings. */
export function withQuickFacts(facts: readonly Fact[], counted: number, savings: MinorUnits): readonly Fact[] {
  const own: Fact[] = [{ code: 'quick_lines_counted', values: { count: counted } }];
  if (savings > 0) own.push({ code: 'quick_savings_counted', values: { amount: savings } });
  const kept: Fact[] = [];
  for (const f of facts) {
    if (f.code !== 'unlocked_goals_counted') {
      kept.push(f);
      continue;
    }
    // The quick savings are an unlocked goal to the engine; this answer names them in their own fact, so they leave this one.
    const rest = (f.values.amount as number) - savings;
    if (rest > 0) kept.push({ ...f, values: { ...f.values, amount: rest } });
  }
  const at = kept.findIndex((f) => f.code === 'free_help');
  return at < 0 ? [...kept, ...own] : [...kept.slice(0, at), ...own, ...kept.slice(at)];
}

/** judgeCheck for this check with its quick lines counted; with none, exactly judgeCheck. */
export function judgeWithQuickLines(prepared: Prepared, check: CheckV2): Evaluation {
  if ((check.quickLines ?? []).length === 0) return judgeCheck(prepared, check);
  const overlay = withQuickLines(prepared.inputs, check);
  if (overlay.counted === 0) return judgeCheck(prepared, overlay.check);
  // The accounts with no exchange rate were taken out by the first prepare; they stay named in the notices.
  // 06.1 FIN-20: the first prepare already cut the freelance pay (and cleared the share), so its fact is carried over.
  const folded: Prepared = { ...prepare(overlay.inputs), unrated: prepared.unrated, taxSetAside: prepared.taxSetAside ?? null };
  const ev = judgeCheck(folded, overlay.check);
  if (ev.result.code === 'needs_input') return ev;
  return { ...ev, result: { ...ev.result, facts: withQuickFacts(ev.result.facts, overlay.counted, overlay.savings) } };
}
