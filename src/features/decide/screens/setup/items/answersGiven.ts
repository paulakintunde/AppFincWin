// 06.1-68 (FQ7, CC-5, DC-11): the "Answers you gave" lines on Records. Every live readiness answer (decide_answers kind
// readiness_waiver) reads back as its waiver and becomes one line, newest first; every Grow goal linked to an account (not the
// safety net, which has its own setup item) becomes one line too. Pure: rows and formatters in, lines out. A row whose key no
// longer reads as a waiver is left out (the engine ignores it too).
import type { DecideAnswerRow } from '@/db/decideAnswers';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import type { LocalDate, YearMonth } from '@/engine/decide/v3';
import { waiverOfAnswer } from '@/features/decide/snapshot/v3/waiverKeys';

type T = (key: string, params?: Record<string, string | number>) => string;
const K = 'decide.screens.setupOthers.records.given';

export type GivenLine =
  | { readonly kind: 'waiver'; readonly id: string; readonly text: string; readonly row: DecideAnswerRow }
  | { readonly kind: 'goal'; readonly id: string; readonly text: string; readonly goal: SavingsGoalRow };

export interface GivenFormat {
  date: (d: LocalDate) => string;
  monthName: (ym: YearMonth) => string;
  /** The series' display name, or '' when it has none. */
  seriesName: (seriesId: string) => string;
  /** The account's display name, or '' when it is not found. */
  accountName: (accountId: string) => string;
}

/** One answer's line, in the words of the choice that gave it; null when the row is not a readable readiness answer. */
export function waiverLine(row: Pick<DecideAnswerRow, 'kind' | 'key' | 'on_date'>, f: GivenFormat, t: T): string | null {
  const w = waiverOfAnswer(row);
  if (w === null) return null;
  const named = (key: string, seriesId: string, params: Record<string, string>): string => {
    const name = f.seriesName(seriesId);
    return name === '' ? t(`${K}.${key}NoName`, params) : t(`${K}.${key}`, { ...params, name });
  };
  switch (w.kind) {
    case 'didnt_happen':
      return named('didntHappen', w.seriesId, { date: f.date(w.date) });
    case 'paid_by_other':
      return named('paidByOther', w.seriesId, { date: f.date(w.date) });
    case 'no_pay':
      return named('noPay', w.seriesId, { date: f.date(w.date) });
    case 'always_other':
      return named('alwaysOther', w.seriesId, {});
    case 'income_elsewhere':
      return t(`${K}.incomeElsewhere`);
    case 'nothing_to_add':
      return t(`${K}.nothingToAdd`, { monthName: f.monthName(w.month) });
    case 'month_complete':
      return t(`${K}.monthComplete`, { monthName: f.monthName(w.month) });
    case 'start_from':
      return t(`${K}.startFrom`, { monthName: f.monthName(w.month) });
  }
}

/** The readiness answers (newest first), then the open goals linked to a known account (by name). Deleted rows never show. */
export function givenLines(answers: readonly DecideAnswerRow[], goals: readonly SavingsGoalRow[], f: GivenFormat, t: T): readonly GivenLine[] {
  const waivers = answers
    .filter((a) => a.kind === 'readiness_waiver' && a.deleted_at === null)
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .flatMap((row): GivenLine[] => {
      const text = waiverLine(row, f, t);
      return text === null ? [] : [{ kind: 'waiver', id: row.id, text, row }];
    });
  const links = goals
    .filter((g) => g.deleted_at === null && g.done_at === null && g.is_safety_net !== true && g.account_id != null)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((goal): GivenLine[] => {
      // An account that is gone (or not loaded) names nothing; the line waits for it rather than read "kept in ".
      const account = f.accountName(goal.account_id as string);
      return account === '' ? [] : [{ kind: 'goal', id: goal.id, text: t(`${K}.goalLink`, { envelope: goal.name, account }), goal }];
    });
  return [...waivers, ...links];
}
