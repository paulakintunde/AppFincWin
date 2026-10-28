import type { SetupFacts } from '../../setup/setupFlow';
import { settingsRows, type SettingsAnswers, type SettingsData, type SettingsFormat } from '../settingsRows';

const FACTS: SetupFacts = {
  incomeTypes: ['salary_or_wages'],
  hasRegularPaySeries: true,
  method: null,
  spreadMonths: null,
  steadyAmount: null,
  holdMonths: null,
  fullMonthsOfRecords: 4,
  moneyAccountIds: ['a1', 'a2', 'a3'],
  accountIdsWithUse: ['a1', 'a2', 'a3'],
  everydayOverride: null,
  unspentAnchorSet: true,
  roughTyped: false,
  setupDoneAt: '2026-10-01T00:00:00Z',
};

const ANSWERS: SettingsAnswers = {
  income_types: ['salary_or_wages'],
  income_pattern: 'seasonal',
  variable_method: null,
  steady_amount: null,
  everyday_override: null,
  month_marks: { '2026-08': 'out', '2026-09': 'normal' },
  share_pct: 50,
  detail: 'short',
  remind_plan: true,
  remind_unspent: false,
};

const DATA: SettingsData = {
  settings: ANSWERS,
  regularPay: { amount: 400000, frequency: 'monthly', nextDate: '2026-11-01' },
  otherIncomeCount: 2,
  regularConfirmed: 6,
  loansCount: 2,
  saving: { monthly: 30000, mode: 'fixed', buckets: 2 },
  everyday: 120000,
  accountUse: { set: 3, total: 3 },
  emergency: { amount: 900000, accountName: 'High-interest savings' },
  envelopes: { amount: 250000, count: 3 },
  unspent: { amount: 240000, at: '2026-10-03' },
};

const fmt: SettingsFormat = {
  money: (m) => `$${m / 100}`,
  date: (d) => d,
  word: (k, p) => (p === undefined ? k : `${k}:${JSON.stringify(p)}`),
};

const rowsOf = (facts: SetupFacts, data: SettingsData) => settingsRows(facts, data, fmt).flatMap((g) => g.rows);
const ids = (facts: SetupFacts, data: SettingsData) => rowsOf(facts, data).map((r) => r.id);

describe('settingsRows', () => {
  it('groups the rows under the five sections in the UI-SPEC order', () => {
    const groups = settingsRows(FACTS, DATA, fmt);
    expect(groups.map((g) => g.section)).toEqual(['income', 'regular', 'spending', 'money', 'answers']);
    expect(ids(FACTS, DATA)).toEqual([
      'incomeCounted', 'regularPay', 'pattern', 'otherIncome', 'regularPayments', 'loans', 'saving', 'everyday', 'unusual',
      'accountUse', 'emergency', 'envelopes', 'unspent', 'shared', 'detail', 'reminders',
    ]);
  });

  it('hides Regular pay with no regular pay type, and shows the steady amount only for that method', () => {
    const none = { ...FACTS, incomeTypes: ['freelance'], method: 'match' as const };
    expect(ids(none, DATA)).not.toContain('regularPay');
    expect(ids(none, DATA)).not.toContain('steadyAmount');
    const steady = { ...none, method: 'steady' as const, steadyAmount: 350000 };
    const withSteady = rowsOf(steady, { ...DATA, settings: { ...ANSWERS, variable_method: 'steady', steady_amount: 350000 } });
    const row = withSteady.find((r) => r.id === 'steadyAmount');
    expect(row?.value).toEqual({ key: 'decide.settings.valueSteadyAmount', params: { amount: '$3500' } });
  });

  it('hides Unusual months under two full months and What each account is for with no money accounts', () => {
    const young = { ...FACTS, fullMonthsOfRecords: 1, moneyAccountIds: [], accountIdsWithUse: [] };
    expect(ids(young, DATA)).not.toContain('unusual');
    expect(ids(young, DATA)).not.toContain('accountUse');
  });

  it('says Not set (no value) and Needed for a needed row that is not answered', () => {
    const facts = { ...FACTS, unspentAnchorSet: false };
    const unspent = rowsOf(facts, { ...DATA, unspent: null }).find((r) => r.id === 'unspent');
    expect(unspent?.value).toBeNull();
    expect(unspent?.needed).toBe(true);
    const missingUse = rowsOf({ ...FACTS, accountIdsWithUse: ['a1'] }, { ...DATA, accountUse: { set: 1, total: 3 } }).find((r) => r.id === 'accountUse');
    expect(missingUse?.needed).toBe(true);
    expect(missingUse?.value).toBeNull();
  });

  it('leaves an optional row unanswered as Not set without calling it Needed', () => {
    const rows = rowsOf(FACTS, { ...DATA, settings: { ...ANSWERS, income_pattern: null }, emergency: null });
    const pattern = rows.find((r) => r.id === 'pattern');
    const emergency = rows.find((r) => r.id === 'emergency');
    expect(pattern).toMatchObject({ value: null, needed: false });
    expect(emergency).toMatchObject({ value: null, needed: false });
  });

  it('builds the values from the stored answers and figures', () => {
    const by = Object.fromEntries(rowsOf(FACTS, DATA).map((r) => [r.id, r.value]));
    expect(by.incomeCounted).toEqual({ key: 'decide.settings.valueIncomeSalary' });
    expect(by.regularPay).toEqual({ key: 'decide.settings.valueRegularPay', params: { amount: '$4000', frequency: 'record.recurring.frequency.monthly', date: '2026-11-01' } });
    expect(by.pattern).toEqual({ key: 'decide.settings.valuePatternSeasonal' });
    expect(by.unusual).toEqual({ key: 'decide.settings.valueUnusual', params: { count: 1 } });
    expect(by.accountUse).toEqual({ key: 'decide.settings.valueAccountUse', params: { set: 3, total: 3 } });
    expect(by.emergency).toEqual({ key: 'decide.settings.valueEmergency', params: { amount: '$9000', account: 'High-interest savings' } });
    expect(by.shared).toEqual({ key: 'decide.settings.valueSharedShare', params: { percent: 50 } });
    expect(by.reminders).toEqual({ key: 'decide.settings.valueReminders', params: { count: 1 } });
    expect(by.everyday).toEqual({ key: 'decide.settings.valueEverydayRecords', params: { amount: '$1200' } });
  });

  it('marks an own everyday figure and a 100 percent share as Just me', () => {
    const rows = rowsOf(FACTS, { ...DATA, settings: { ...ANSWERS, everyday_override: 90000, share_pct: 100 } });
    expect(rows.find((r) => r.id === 'everyday')?.value).toMatchObject({ key: 'decide.settings.valueEverydayOwn' });
    expect(rows.find((r) => r.id === 'shared')?.value).toEqual({ key: 'decide.settings.valueSharedJustMe' });
  });

  it('sends Emergency fund and Unspent money to their sheets and the rest to their step', () => {
    const rows = rowsOf(FACTS, DATA);
    expect(rows.find((r) => r.id === 'emergency')?.action).toBe('emergency');
    expect(rows.find((r) => r.id === 'unspent')?.action).toBe('unspent');
    expect(rows.find((r) => r.id === 'accountUse')).toMatchObject({ action: 'step', step: 'accountUse' });
  });

  it('passes a zero count for empty Other income and Envelopes so the copy reads None / None yet', () => {
    const rows = rowsOf(FACTS, { ...DATA, otherIncomeCount: 0, envelopes: { amount: 0, count: 0 } });
    expect(rows.find((r) => r.id === 'otherIncome')?.value).toEqual({ key: 'decide.settings.valueOtherIncome', params: { count: 0 } });
    expect(rows.find((r) => r.id === 'envelopes')?.value).toEqual({ key: 'decide.settings.valueEnvelopes', params: { amount: '$0', count: 0 } });
  });
});
