/**
 * Plan 05.2-34 (DSU-13): the rows of Decide settings, as a pure model. No React, no I/O, no arithmetic on money: every
 * figure arrives already computed (engine output or stored answers) and is only formatted here. Returns i18n keys and
 * params; the screen draws them.
 *
 * Source: UI-SPEC "Decide settings" row table. Rows are grouped under the five setup section names. A row for a step
 * that does not apply (Regular pay with no regular pay type, Steady amount outside the steady method, Unusual months
 * under two full months) is hidden. An unanswered row has no value (the screen says "Not set"); a needed one also says
 * "Needed".
 */
import { isAnswered, isNeeded, sectionOf, visibleSteps, type SetupFacts, type SetupSection, type SetupStepKey } from '../setup/setupFlow';

/** What a row shows: a copy key with params, plain text (already formatted), or nothing yet. */
export type SettingsValue = { readonly key: string; readonly params?: Readonly<Record<string, string | number>> } | { readonly text: string } | null;

export type SettingsRowAction = 'step' | 'emergency' | 'unspent';

export interface SettingsRowModel {
  readonly id: string;
  readonly step: SetupStepKey;
  readonly labelKey: string;
  readonly effectKey: string;
  readonly value: SettingsValue;
  readonly needed: boolean;
  readonly action: SettingsRowAction;
}

export interface SettingsRowGroup {
  readonly section: SetupSection;
  readonly rows: readonly SettingsRowModel[];
}

export interface SettingsAnswers {
  readonly income_types: readonly string[] | null;
  readonly income_pattern: 'steady' | 'variable' | 'seasonal' | null;
  readonly variable_method: 'match' | 'spread' | 'steady' | 'balance' | null;
  readonly steady_amount: number | null;
  readonly everyday_override: number | null;
  readonly month_marks: Readonly<Record<string, 'normal' | 'out' | 'half'>> | null;
  readonly share_pct: number | null;
  readonly detail: 'short' | 'full' | null;
  readonly remind_plan: boolean | null;
  readonly remind_unspent: boolean | null;
}

/** Figures the screen reads from the app's own data; the model never recomputes them. */
export interface SettingsData {
  readonly settings: SettingsAnswers | null;
  /** The live regular pay series: monthly-or-other amount, frequency key, next pay date. */
  readonly regularPay: { readonly amount: number; readonly currency?: string; readonly frequency: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'; readonly nextDate: string | null } | null;
  readonly otherIncomeCount: number;
  readonly regularConfirmed: number;
  readonly loansCount: number;
  /** Regular saving: the monthly total, its mode (null when mixed or unset) and the number of saving buckets. */
  readonly saving: { readonly monthly: number; readonly mode: 'fixed' | 'flexible' | null; readonly buckets: number } | null;
  /** The everyday figure in use (the engine's typical month, or the user's own). Null when unknown. */
  readonly everyday: number | null;
  readonly accountUse: { readonly set: number; readonly total: number };
  readonly emergency: { readonly amount: number | null; readonly accountName: string | null } | null;
  readonly envelopes: { readonly amount: number; readonly count: number };
  readonly unspent: { readonly amount: number; readonly at: string } | null;
}

export interface SettingsFormat {
  /** Formats in `currency` when given, otherwise in the settings currency (where the value is stored). */
  money(minor: number, currency?: string): string;
  date(iso: string): string;
  /** Looks a copy key up (used for words inside a value, such as a frequency). */
  word(key: string, params?: Record<string, string | number>): string;
}

const FREQ_WORD: Readonly<Record<'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly', string>> = {
  weekly: 'record.recurring.frequency.weekly',
  fortnightly: 'record.recurring.frequency.fortnightly',
  monthly: 'record.recurring.frequency.monthly',
  quarterly: 'record.recurring.frequency.quarterly',
  yearly: 'record.recurring.frequency.yearly',
};

const INCOME_WORD: Readonly<Record<string, string>> = {
  salary_or_wages: 'income.paid.optionSalary',
  commission_or_tips: 'income.paid.optionCommission',
  freelance: 'income.paid.optionFreelance',
  own_business: 'income.paid.optionBusiness',
  pension_or_benefits: 'income.paid.optionPension',
  none: 'income.paid.optionNone',
};

const PATTERN_WORD = {
  steady: 'income.season.optionSteady',
  variable: 'income.season.optionVariable',
  seasonal: 'decide.settings.valuePatternSeasonal',
} as const;

const K = 'decide.settings.';

interface RowDef {
  readonly id: string;
  readonly step: SetupStepKey;
  readonly labelKey: string;
  readonly effectKey: string;
  readonly action?: SettingsRowAction;
}

const def = (id: string, step: SetupStepKey, action?: SettingsRowAction): RowDef => ({
  id,
  step,
  labelKey: `${K}row.${id}.label`,
  effectKey: `${K}row.${id}.effect`,
  ...(action !== undefined ? { action } : {}),
});

/** UI-SPEC order. */
const ROW_DEFS: readonly RowDef[] = [
  def('incomeCounted', 'paid'),
  def('regularPay', 'pay'),
  def('pattern', 'season'),
  def('steadyAmount', 'method'),
  def('otherIncome', 'other'),
  def('regularPayments', 'regular'),
  def('loans', 'loans'),
  def('saving', 'saving'),
  def('everyday', 'everyday'),
  def('unusual', 'unusual'),
  def('accountUse', 'accountUse'),
  def('emergency', 'emergency', 'emergency'),
  def('envelopes', 'envelopes'),
  def('unspent', 'unspent', 'unspent'),
  def('shared', 'share'),
  def('detail', 'detail'),
  def('reminders', 'reminders'),
];

function valueOf(row: RowDef, d: SettingsData, fmt: SettingsFormat): SettingsValue {
  const s = d.settings;
  switch (row.id) {
    case 'incomeCounted': {
      if (s === null || s.income_types === null || s.income_types.length === 0) return null;
      if (s.variable_method === 'steady') return { key: `${K}valueIncomeSteady` };
      if (s.income_types.length === 1 && s.income_types[0] === 'salary_or_wages') return { key: `${K}valueIncomeSalary` };
      const words = s.income_types.map((x) => INCOME_WORD[x]).filter((k): k is string => k !== undefined);
      return { text: words.map((k) => fmt.word(k)).join(fmt.word('decide.setup.summary.joiner')) };
    }
    case 'regularPay': {
      const p = d.regularPay;
      if (p === null) return null;
      const frequency = fmt.word(FREQ_WORD[p.frequency]);
      if (p.nextDate === null) return { text: `${fmt.money(p.amount, p.currency)} ${frequency}` };
      return { key: `${K}valueRegularPay`, params: { amount: fmt.money(p.amount, p.currency), frequency, date: fmt.date(p.nextDate) } };
    }
    case 'pattern':
      return s === null || s.income_pattern === null ? null : { key: PATTERN_WORD[s.income_pattern] };
    case 'steadyAmount':
      return s === null || s.steady_amount === null ? null : { key: `${K}valueSteadyAmount`, params: { amount: fmt.money(s.steady_amount) } };
    case 'otherIncome':
      return { key: `${K}valueOtherIncome`, params: { count: d.otherIncomeCount } };
    case 'regularPayments':
      return { key: `${K}valueRegularPayments`, params: { count: d.regularConfirmed } };
    case 'loans':
      return { key: `${K}valueLoans`, params: { count: d.loansCount } };
    case 'saving': {
      const v = d.saving;
      if (v === null) return null;
      const head =
        v.mode === null
          ? fmt.word(`${K}valueSteadyAmount`, { amount: fmt.money(v.monthly) })
          : fmt.word(`${K}valueSaving`, { amount: fmt.money(v.monthly), mode: fmt.word(v.mode === 'fixed' ? `${K}valueSavingFixed` : `${K}valueSavingFlexible`) });
      return { text: v.buckets > 0 ? `${head} · ${fmt.word(`${K}valueBuckets`, { count: v.buckets })}` : head };
    }
    case 'everyday': {
      if (d.everyday === null) return null;
      const own = s !== null && s.everyday_override !== null;
      return { key: own ? `${K}valueEverydayOwn` : `${K}valueEverydayRecords`, params: { amount: fmt.money(d.everyday) } };
    }
    case 'unusual': {
      const left = s?.month_marks == null ? 0 : Object.values(s.month_marks).filter((m) => m === 'out' || m === 'half').length;
      return { key: `${K}valueUnusual`, params: { count: left } };
    }
    case 'accountUse':
      return d.accountUse.total === 0 ? null : { key: `${K}valueAccountUse`, params: { set: d.accountUse.set, total: d.accountUse.total } };
    case 'emergency': {
      const e = d.emergency;
      if (e === null || e.amount === null) return null;
      return e.accountName === null ? { text: fmt.money(e.amount) } : { key: `${K}valueEmergency`, params: { amount: fmt.money(e.amount), account: e.accountName } };
    }
    case 'envelopes':
      return { key: `${K}valueEnvelopes`, params: { amount: fmt.money(d.envelopes.amount), count: d.envelopes.count } };
    case 'unspent':
      return d.unspent === null ? null : { key: `${K}valueUnspent`, params: { amount: fmt.money(d.unspent.amount), date: fmt.date(d.unspent.at) } };
    case 'shared': {
      if (s === null || s.share_pct === null) return null;
      return s.share_pct >= 100 ? { key: `${K}valueSharedJustMe` } : { key: `${K}valueSharedShare`, params: { percent: s.share_pct } };
    }
    case 'detail':
      return s === null || s.detail === null ? null : { key: s.detail === 'full' ? `${K}valueDetailFull` : `${K}valueDetailShort` };
    case 'reminders': {
      if (s === null || (s.remind_plan === null && s.remind_unspent === null)) return null;
      return { key: `${K}valueReminders`, params: { count: (s.remind_plan === true ? 1 : 0) + (s.remind_unspent === true ? 1 : 0) } };
    }
    default:
      return null;
  }
}

/** Whether the row's step applies to this user (hidden otherwise). */
function applies(row: RowDef, facts: SetupFacts, visible: ReadonlySet<SetupStepKey>): boolean {
  if (row.id === 'steadyAmount') return facts.method === 'steady' && visible.has('method');
  return visible.has(row.step);
}

export function settingsRows(facts: SetupFacts, data: SettingsData, fmt: SettingsFormat): SettingsRowGroup[] {
  const visible = new Set(visibleSteps(facts, 'full'));
  const groups = new Map<SetupSection, SettingsRowModel[]>();
  for (const row of ROW_DEFS) {
    if (!applies(row, facts, visible)) continue;
    const section = sectionOf(row.step);
    if (section === null) continue;
    const needed = isNeeded(row.step, facts);
    const answered = isAnswered(row.step, facts);
    const raw = valueOf(row, data, fmt);
    // A needed step that is not answered says "Not set" and "Needed", whatever a partial figure might read.
    const value = needed && !answered ? null : raw;
    const list = groups.get(section) ?? [];
    list.push({
      id: row.id,
      step: row.step,
      labelKey: row.labelKey,
      effectKey: row.effectKey,
      value,
      needed: needed && !answered,
      action: row.action ?? 'step',
    });
    groups.set(section, list);
  }
  const order: SetupSection[] = ['income', 'regular', 'spending', 'money', 'answers'];
  return order.flatMap((section) => {
    const rows = groups.get(section);
    return rows === undefined || rows.length === 0 ? [] : [{ section, rows }];
  });
}
