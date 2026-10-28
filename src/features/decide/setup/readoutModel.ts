/**
 * Plan 05.2-35 (D-19): the engine readout as a pure model. No React, no I/O, no arithmetic beyond counting and adding
 * whole minor units that the engine already holds. Every row says what the engine now receives; a row with nothing to say
 * is left out (the UI-SPEC "Engine readout" table, in its order).
 *
 * Values arrive formatted through the passed formatter, so this file owns no money or date formatting. Labels are copy
 * keys; the screen draws them.
 */
import type { Evaluation, IncomePattern, IncomeType, MissingCode, V3Inputs } from '@/engine/decide/v3';

const K = 'decide.setupPage.';

export interface ReadoutFormat {
  money(minor: number): string;
  date(iso: string): string;
  /** Looks a copy key up with its params. */
  word(key: string, params?: Record<string, string | number>): string;
}

/** What the engine inputs do not carry: the names behind ids. */
export interface ReadoutAnswers {
  readonly accountNames: Readonly<Record<string, string>>;
}

export interface ReadoutRow {
  readonly id: string;
  readonly labelKey: string;
  readonly value: string;
}

const INCOME_WORD: Readonly<Record<IncomeType, string>> = {
  salary: 'decide.settings.valueIncomeSalary',
  commission: 'income.paid.optionCommission',
  freelance: 'income.paid.optionFreelance',
  none: 'income.paid.optionNone',
  mix: `${K}incomeMix`,
};

const PATTERN_LOWER: Readonly<Record<IncomePattern, string>> = {
  steady: `${K}incomeSteady`,
  variable: `${K}incomeVariable`,
  seasonal: `${K}incomeSeasonal`,
};

const PATTERN_WORD: Readonly<Record<IncomePattern, string>> = {
  steady: `${K}patternSteady`,
  variable: `${K}patternVariable`,
  seasonal: `${K}patternSeasonal`,
};

/** The questions that belong to setup. The rest of the engine's missing codes are about one purchase. */
const SETUP_QUESTIONS: readonly MissingCode[] = [
  'account_use_question',
  'pay_arrival_question',
  'income_pattern_unconfirmed',
  'expected_income_needed',
  'unexplained_money_question',
  'no_income_figures',
  'everyday_unknown',
];

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

function join(fmt: ReadoutFormat, first: string, second: string): string {
  return fmt.word(`${K}valueJoin`, { first, second });
}

/** The first setup question the engine is asking, as its existing copy text. Null when it is asking none. */
export function nextQuestionText(evaluation: Evaluation, answers: ReadoutAnswers, fmt: ReadoutFormat): string | null {
  const { result, funds } = evaluation;
  const code = result.missing.find((m) => SETUP_QUESTIONS.includes(m));
  if (code === undefined) return null;
  const notice = (name: string) => result.notices.find((n) => n.code === name)?.values ?? {};
  const base = `decide.v3.missing.${code}`;
  switch (code) {
    case 'pay_arrival_question': {
      const v = notice('pay_not_seen');
      return fmt.word(base, { amount: fmt.money(num(v.amount)), date: fmt.date(String(v.date)) });
    }
    case 'unexplained_money_question':
      return fmt.word(base, { amount: fmt.money(num(notice('unexplained_money').amount)) });
    case 'account_use_question': {
      const unstated = funds.unstatedAccounts ?? [];
      if (unstated.length === 0 && funds.fundUnlinked === true) return fmt.word(`${base}_fund`);
      const id = notice('account_use_unknown').accountId;
      const name = typeof id === 'string' ? answers.accountNames[id] : undefined;
      return fmt.word(base, { account: name ?? fmt.word(`${K}accountFallback`) });
    }
    default:
      return fmt.word(base);
  }
}

export function readoutRows(inputs: V3Inputs, evaluation: Evaluation, answers: ReadoutAnswers, fmt: ReadoutFormat): ReadoutRow[] {
  const rows: ReadoutRow[] = [];
  const add = (id: string, labelKey: string, value: string | null): void => {
    if (value !== null) rows.push({ id, labelKey, value });
  };

  // Accounts counted: those with a stated use, of all the accounts the engine was given.
  const accounts = inputs.accounts ?? [];
  if (accounts.length > 0) {
    const set = accounts.filter((a) => a.use !== null).length;
    const counted = fmt.word(`${K}valueAccounts`, { set, total: accounts.length });
    const missing = accounts.length - set;
    add('accounts', `${K}labelAccounts`, missing > 0 ? join(fmt, counted, fmt.word(`${K}hintAccounts`, { count: missing })) : counted);
  }

  // Income profile.
  const profile = inputs.profile;
  if (profile === null) {
    add('income', `${K}labelIncome`, fmt.word(`${K}valueNotSet`));
  } else {
    const kinds = profile.types.map((x) => fmt.word(INCOME_WORD[x])).join(', ');
    const pattern = profile.pattern ?? null;
    add('income', `${K}labelIncome`, pattern === null ? kinds : join(fmt, kinds, fmt.word(PATTERN_LOWER[pattern])));
  }

  // Pattern / expected income: only with something to say.
  const pattern = profile?.pattern ?? null;
  const confirmed = (inputs.expectedIncome ?? []).length;
  if (pattern !== null || confirmed > 0) {
    const word = pattern === null ? null : fmt.word(PATTERN_WORD[pattern]);
    const months = confirmed > 0 ? fmt.word(`${K}confirmedMonths`, { count: confirmed }) : null;
    add('pattern', `${K}labelPattern`, word !== null && months !== null ? join(fmt, word, months) : (word ?? months));
  }

  // Typical month used.
  if (inputs.everydayOverride !== null) {
    add('typical', `${K}labelTypical`, join(fmt, fmt.money(num(inputs.everydayOverride)), fmt.word(`${K}valueOwnFigure`)));
  } else if (evaluation.month.e !== null) {
    add('typical', `${K}labelTypical`, join(fmt, fmt.money(num(evaluation.month.e)), fmt.word(`${K}valueFromRecords`)));
  }

  // Unspent money, as stored.
  if (inputs.unspent !== null) {
    add('unspent', `${K}labelUnspent`, fmt.word(`${K}valueUnspent`, { amount: fmt.money(num(inputs.unspent.amount)), date: fmt.date(inputs.unspent.at) }));
  }

  // Emergency fund.
  if (inputs.emergency !== null) {
    const amount = fmt.money(num(inputs.emergency.amount));
    const id = inputs.emergency.accountId;
    const name = id === null || id === undefined ? undefined : answers.accountNames[id];
    add('emergency', `${K}labelEmergency`, name === undefined ? amount : join(fmt, amount, name));
  }

  // Envelopes: how many, how much is saved, how many sit in a named account.
  if (inputs.envelopes.length > 0) {
    const placed = inputs.envelopes.filter((e) => e.accountId !== null && e.accountId !== undefined).length;
    const saved = fmt.word(`${K}envelopesSaved`, { amount: fmt.money(num(evaluation.funds.envelopesSaved)) });
    add('envelopes', `${K}labelEnvelopes`, [String(inputs.envelopes.length), saved, fmt.word(`${K}envelopesPlaced`, { count: placed })].join(' · '));
  }

  // Money held back for earlier plans.
  const bridges = inputs.heldBridges ?? [];
  if (bridges.length > 0) {
    add('held', `${K}labelHeld`, fmt.money(bridges.reduce((sum, b) => sum + num(b.amount), 0)));
  }

  // Refunds linked to a purchase.
  const refunds = inputs.months.reduce((n, m) => n + m.lines.filter((l) => l.refundOf !== undefined && l.refundOf !== null).length, 0);
  if (refunds > 0) add('refunds', `${K}labelRefunds`, String(refunds));

  // Pay arrivals saved.
  const arrivals = inputs.payArrivals ?? [];
  if (arrivals.length > 0) {
    const pending = arrivals.filter((a) => !a.arrived).length;
    add(
      'arrivals',
      `${K}labelArrivals`,
      pending > 0 ? fmt.word(`${K}arrivalsPending`, { count: pending }) : fmt.word(`${K}arrivalsArrived`, { count: arrivals.length }),
    );
  }

  add('next', `${K}labelNext`, nextQuestionText(evaluation, answers, fmt));
  return rows;
}
