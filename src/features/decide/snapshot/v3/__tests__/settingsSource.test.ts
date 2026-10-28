import type { DecideAnswerRow } from '@/db/decideAnswers';
import { EMPTY_DECIDE_SETTINGS, type DecideSettingsRow } from '@/db/decideSettings';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { engineIncomeTypes, settingsSourceOf } from '../settingsSource';

const settings = (over: Partial<DecideSettingsRow> = {}): DecideSettingsRow => ({ ...EMPTY_DECIDE_SETTINGS, user_id: 'u1', ...over });
const answer = (over: Partial<DecideAnswerRow> = {}): DecideAnswerRow => ({
  id: 'a1', household_id: 'h1', created_by: 'u1', kind: 'held_bridge', key: 'k', amount: 100, bool_value: null, on_date: null, check_id: null,
  deleted_at: null, version: 1, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
});
const dismissal = (over: Partial<RecurringDismissalRow> = {}): RecurringDismissalRow => ({
  id: 'd1', household_id: 'h1', payee_key: 'netflix|USD|-1', direction: 'out', dismissed_at: '2026-10-01T00:00:00Z', created_by: 'u1', deleted_at: null, version: 1, ...over,
});
const run = (over: Partial<Parameters<typeof settingsSourceOf>[0]> = {}) =>
  settingsSourceOf({ settings: settings(), answers: [], dismissals: [], checks: [], planLive: () => true, ...over });

describe('engineIncomeTypes (D-17)', () => {
  it.each([
    [['salary_or_wages'], ['salary']],
    [['pension_or_benefits'], ['salary']],
    [['commission_or_tips'], ['commission']],
    [['freelance'], ['freelance']],
    [['own_business'], ['freelance']],
    [['none'], ['none']],
    [['salary_or_wages', 'own_business'], ['salary', 'freelance']],
    [['salary_or_wages', 'pension_or_benefits'], ['salary']],
    [['bogus', 'freelance'], ['freelance']],
    [['salary', 'commission', 'mix'], ['salary', 'commission', 'mix']],
    [[], []],
    [null, []],
  ])('%j -> %j', (input, expected) => {
    expect(engineIncomeTypes(input)).toEqual(expected);
  });
});

describe('settingsSourceOf', () => {
  it('is null without a settings row', () => {
    expect(run({ settings: null })).toBeNull();
  });

  it('copies every column; income_types stays the setup values', () => {
    const v3 = run({
      settings: settings({
        income_types: ['pension_or_benefits'], income_pattern: 'seasonal', income_pattern_confirmed: true, variable_method: 'spread', steady_amount: 5, spread_months: 3,
        hold_months: 2, unspent_anchor: -4, unspent_anchor_at: '2026-10-01', reserve_account_id: 'acc', reserve_goal: 9, everyday_override: 7, everyday_override_at: '2026-10-02',
        month_marks: { '2026-09': 'out' }, rough_saving: 1, rough_debt: 2, rough_invest: 3, rough_as_of: '2026-10-03',
        unexplained_amount: 11, unexplained_use: 'spare', unexplained_at: '2026-10-04',
      }),
    })!;
    expect(v3).toMatchObject({
      income_types: ['pension_or_benefits'], income_pattern: 'seasonal', income_pattern_confirmed: true, variable_method: 'spread', steady_amount: 5, spread_months: 3,
      hold_months: 2, unspent_anchor: -4, unspent_anchor_at: '2026-10-01', reserve_account_id: 'acc', reserve_goal: 9, everyday_override: 7, everyday_override_at: '2026-10-02',
      month_marks: { '2026-09': 'out' }, rough_saving: 1, rough_debt: 2, rough_invest: 3, rough_as_of: '2026-10-03',
      unexplained_amount: 11, unexplained_use: 'spare', unexplained_at: '2026-10-04',
      series_extra: {}, own_lines: [], custom_options: null,
    });
  });

  it('keeps only live answers, in the lite shape', () => {
    const v3 = run({ answers: [answer({ id: 'a1', key: 'x', created_by: 'ignored' }), answer({ id: 'a2', deleted_at: '2026-10-02T00:00:00Z' })] })!;
    expect(v3.answers).toEqual([{ kind: 'held_bridge', key: 'x', amount: 100, bool_value: null, on_date: null, check_id: null }]);
  });

  it('turns live dismissals into the recurring keys', () => {
    const v3 = run({ dismissals: [dismissal(), dismissal({ id: 'd2', payee_key: 'gym|USD|-1', deleted_at: '2026-10-02T00:00:00Z' })] })!;
    expect(v3.dismissals).toEqual(['netflix|USD|-1']);
  });

  it('a held-back bridge counts only for a bought, undeleted check whose plan is live', () => {
    const checks = [
      { id: 'bought-live', status: 'bought', deleted_at: null },
      { id: 'bought-ended', status: 'bought', deleted_at: null },
      { id: 'bought-deleted', status: 'bought', deleted_at: '2026-10-02T00:00:00Z' },
      { id: 'open', status: 'open', deleted_at: null },
    ];
    const v3 = run({ checks, planLive: (id) => id !== 'bought-ended' })!;
    expect(v3.live_bridge_check_ids).toEqual(['bought-live']);
  });
});
