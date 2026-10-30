// 05.3-32: shared builders for the in-place question tests.
import type { AskQuestion } from '../../model/ask';

export const fakeFormat = {
  money: (minor: number) => `$${Math.round(minor / 100)}`,
  moneyA11y: (minor: number) => `${Math.round(minor / 100)} dollars`,
  month: (ym: string) => (ym === '2026-10' ? 'October' : ym),
  monthYear: (ym: string) => ym,
  date: (iso: string) => `on ${iso}`,
  params: () => ({ screen: {}, a11y: {} }),
  flat: (p: Readonly<Record<string, string | number>>) => {
    const screen: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === 'accountId') screen.account = 'Everyday Checking';
      else if (k === 'amount' || k === 'monthly') screen[k] = `$${Math.round(Number(v) / 100)}`;
      else screen[k] = String(v);
    }
    return { screen, a11y: screen };
  },
};

export const accountUseQuestion = (over: Partial<AskQuestion> = {}): AskQuestion => ({
  code: 'account_use_question',
  questionKey: 'decide.v3.missing.account_use_question',
  variant: null,
  params: { accountId: 'a1' },
  pay: null,
  months: [],
  ...over,
});

export const payQuestion = (pay: AskQuestion['pay'] = { seriesId: 's1', payDate: '2026-10-15' as never, amount: 250000 as never }): AskQuestion => ({
  code: 'pay_arrival_question',
  questionKey: 'decide.v3.missing.pay_arrival_question',
  variant: null,
  params: { amount: 250000, date: '2026-10-15' },
  pay,
  months: [],
});

export const coverQuestion = (): AskQuestion => ({
  code: 'volatile_cover_question',
  questionKey: 'decide.v3.missing.volatile_cover_question',
  variant: null,
  params: { monthly: 120000, months: 3 },
  pay: null,
  months: [],
});

export const modelOf = (first: AskQuestion, more = 0, k = 1, n = more + 1) =>
  ({
    first,
    k,
    n,
    more,
    moreKey: more === 0 ? null : more === 1 ? 'decide.v3.ui.ask.andMore_one' : 'decide.v3.ui.ask.andMore_other',
  }) as const;
