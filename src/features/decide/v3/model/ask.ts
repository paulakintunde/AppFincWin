/**
 * 05.3-20 (D-07, D-08, D-59). PURE. Which question the in-place card asks, its placeholder values and how many follow.
 * The order is the engine's (Result.missing is already in MISSING_PRIORITY order); nothing here re-sorts it.
 */
import { MISSING_KEYS, MISSING_VALUE_SOURCE } from '@/engine/decide/v3';
import type { Evaluation, LocalDate, MissingCode, Notice, Result, YearMonth } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money/types';

export const QUESTION_CODES: ReadonlySet<MissingCode> = new Set<MissingCode>([
  'account_use_question',
  'pay_arrival_question',
  'unspent_not_confirmed',
  'unexplained_money_question',
  'income_pattern_unconfirmed',
  'expected_income_needed',
  'volatile_cover_question',
]);

export interface AskQuestion {
  readonly code: MissingCode;
  readonly questionKey: string;
  readonly variant: 'fund' | null;
  readonly params: Readonly<Record<string, string | number>>;
  readonly pay: { readonly seriesId: string; readonly payDate: LocalDate; readonly amount: MinorUnits } | null;
  readonly months: readonly YearMonth[];
}

/** Props every in-place answer body takes (05.3-32, 05.3-33). Type only. */
export interface AskBodyProps {
  question: AskQuestion;
  checkId: string;
  userId: string;
  householdId: string;
  onSaved(stepId: string | null): void;
}

type ValueSourceCode = keyof typeof MISSING_VALUE_SOURCE;

function noticeParams(notices: readonly Notice[], code: string, keys: readonly string[]): Record<string, string | number> {
  const notice = notices.find((n) => n.code === code);
  const out: Record<string, string | number> = {};
  if (notice === undefined) return out;
  for (const k of keys) {
    const v = notice.values[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

const VALUE_KEYS: Readonly<Record<ValueSourceCode, readonly string[]>> = {
  volatile_cover_question: ['monthly', 'months'],
  unexplained_money_question: ['amount'],
  account_use_question: ['accountId', 'count'],
  pay_arrival_question: ['amount', 'date'],
};

function build(code: MissingCode, ev: Pick<Evaluation, 'result' | 'month'>): AskQuestion {
  const notices = ev.result.notices;
  const base = { code, questionKey: MISSING_KEYS[code], variant: null, params: {}, pay: null, months: [] } satisfies AskQuestion;
  if (code === 'account_use_question') {
    const hasUse = notices.some((n) => n.code === MISSING_VALUE_SOURCE.account_use_question);
    if (!hasUse && notices.some((n) => n.code === 'fund_account_unknown')) {
      return { ...base, variant: 'fund', questionKey: `${MISSING_KEYS[code]}_fund`, params: noticeParams(notices, 'fund_account_unknown', ['amount']) };
    }
  }
  if (code in MISSING_VALUE_SOURCE) {
    const key = code as ValueSourceCode;
    const params = noticeParams(notices, MISSING_VALUE_SOURCE[key], VALUE_KEYS[key]);
    if (code === 'pay_arrival_question') {
      const unseen = (ev.month.unseenPay ?? []).find((p) => p.arrived === null) ?? null;
      const pay = unseen === null ? null : { seriesId: unseen.seriesId, payDate: unseen.date, amount: unseen.amount };
      return { ...base, params, pay };
    }
    return { ...base, params };
  }
  if (code === 'expected_income_needed') {
    // The engine reports only that some month is uncovered, not which; this month is shown and the count is one.
    return { ...base, params: { month: ev.month.month, months: 1 }, months: [ev.month.month] };
  }
  return base;
}

export function askModel(ev: Pick<Evaluation, 'result' | 'month'>): { first: AskQuestion; k: number; n: number; more: number; moreKey: string | null } | null {
  const questions = ev.result.missing.filter((m) => QUESTION_CODES.has(m));
  const head = questions[0];
  if (head === undefined) return null;
  const more = questions.length - 1;
  return {
    first: build(head, ev),
    k: 1,
    n: questions.length,
    more,
    moreKey: more === 0 ? null : more === 1 ? 'decide.v3.ui.ask.andMore_one' : 'decide.v3.ui.ask.andMore_other',
  };
}

export function needsInputLines(result: Pick<Result, 'missing'>): readonly string[] {
  return result.missing.filter((m) => !QUESTION_CODES.has(m)).map((m) => MISSING_KEYS[m]);
}

export function askAnsweredProps(code: MissingCode): {
  missing: 'account_use_question' | 'pay_arrival_question' | 'unspent_not_confirmed' | 'unexplained_money_question' | 'income_pattern_unconfirmed' | 'expected_income_needed' | 'volatile_cover_question';
} {
  if (!QUESTION_CODES.has(code)) throw new RangeError(`not a question code: ${code}`);
  return { missing: code as 'account_use_question' };
}
