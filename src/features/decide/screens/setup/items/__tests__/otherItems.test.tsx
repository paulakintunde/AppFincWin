// 06.1-25: setup items 3 to 6. Debts writes the due day through Grow's writer and keeps "No other debts"; the safety net never unlocks
// from here; Your money rules says "No rules" when all are off; Records' Done follows the three D-11 checks.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { dueDayEdits, hasBadDueDay, recordChecks, accountUseOfChoice, choiceOfUse, rulesOnCount, USE_CHOICES } from '../othersLogic';
import type { SetupFacts } from '../../../logic/setupProgress';
import { DebtsSetup } from '../DebtsSetup';
import { NetSetup } from '../NetSetup';
import { RecordsSetup } from '../RecordsSetup';
import { RulesSetup } from '../RulesSetup';

jest.setTimeout(60000);

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, push: mockPush, back: jest.fn(), canGoBack: () => false }), useLocalSearchParams: () => ({}) }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-20' }),
}));

const mockSetAnswered = jest.fn((..._a: unknown[]) => ({ stepId: 'step-flag' }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSetDecideAnswered: () => ({ set: mockSetAnswered }), useSaveSetupStep: () => ({ save: jest.fn() }) }));
let mockSettings: Record<string, unknown> = {};
let mockDebts: unknown[] = [];
jest.mock('@/data/queries/decide', () => ({
  useDecideSettings: () => ({ data: mockSettings }),
  useDebts: () => ({ data: mockDebts }),
}));
let mockInputs: unknown = null;
let mockEvaluation: unknown = null;
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ inputs: mockInputs, evaluation: mockEvaluation, source: null, v3: null }) }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
let mockAccounts: unknown[] = [];
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
let mockGoals: unknown[] = [];
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockGoals }) }));
jest.mock('@/features/grow/goals/useGoalsRead', () => ({ useGoalsRead: () => ({ model: { safetyNet: { size: 230000, saved: 130000 } } }) }));
jest.mock('@/ui/ProgressBar', () => ({ ProgressBar: () => null }));
jest.mock('@/features/grow/safetyNet/netPreview', () => ({ essentialMonthOf: () => 230000 }));

let mockDoc: { v: 1; rules: unknown[] } = { v: 1, rules: [] };
let mockDsr: string | null = null;
const mockRuleSave = jest.fn(() => 'step-rule');
jest.mock('../../../home/useHomeCards', () => ({
  useMoneyRules: () => ({ dsrLine: mockDsr, doc: mockDoc, save: mockRuleSave }),
  useRuleCrossings: () => () => [],
}));
let mockGrow: { saving: number | null; investing: number | null } = { saving: null, investing: null };
jest.mock('../../../home/useHomeFacts', () => ({
  rulesFactsOf: () => ({ netLocked: null, ...mockGrow }),
  footerFactsOf: (i: { months: { full: boolean; lines: unknown[] }[] } | null) => ({ months: i === null ? 0 : i.months.filter((m) => m.full).length, entries: i === null ? 0 : i.months.reduce((n, m) => n + m.lines.length, 0) }),
}));
jest.mock('../../../home/RuleEditSheet', () => ({ RuleEditSheet: () => null }));
jest.mock('../../../home/AddRuleSheet', () => ({ AddRuleSheet: () => null }));

let mockFacts: SetupFacts | null = null;
jest.mock('../../useSetupProgress', () => ({ useSetupFacts: () => ({ loading: mockFacts === null, facts: mockFacts, currency: 'USD', today: '2026-11-20' }) }));
const mockSaveUse = jest.fn((..._a: unknown[]) => ({ stepId: 'step-use' }));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: mockSaveUse }) }));
jest.mock('@/features/record/accounts/AccountUseSheet', () => ({ AccountUseSheet: () => null }));
// 06.1-45: Records now reads the answer writer and the query cache for the readiness list.
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: jest.fn(() => null) }), useRemoveDecideAnswer: () => ({ remove: jest.fn(() => ({ stepId: 'step' })) }) }));
// 06.1-68: Records reads the live answers for "Answers you gave".
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => ({ data: [] }) }));
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueryClient: () => ({ getQueriesData: () => [] }) }));
const RECORDS_WRITES = { setEnvelopeAccount: jest.fn(() => 'step'), skipLine: jest.fn(() => null), clearEnvelopeAccount: jest.fn(() => 'step') };

const facts = (over: Partial<SetupFacts> = {}): SetupFacts => ({
  hasPay: true, payAmountMinor: 320000, payDay: 15, billsRightAnswered: true, billsCount: 3, billsMonthlyMinor: 100000,
  debts: [], noDebtsAnswered: false, netSizeMinor: null, netNotSetAnswered: false, rulesOn: 0, noRulesAnswered: false,
  lastMonthComplete: true, newestEntryThisMonth: '2026-11-10', accountsAllHaveUse: true, recordsUpTo: '2026-11-10',
  readinessOpen: 0, readinessFirst: null, ...over,
});

const debt = (over: Record<string, unknown> = {}) => ({
  id: 'd1', name: 'Visa card', kind: 'card', currency: 'USD', balance: 300000, apr: '22.9', minimum_payment: 15000, due_day: null,
  deleted_at: null, paid_off_on: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = {};
  mockDebts = [debt()];
  mockInputs = null;
  mockEvaluation = null;
  mockAccounts = [{ id: 'a1', name: 'Everyday', kind: 'checking', currency: 'USD', deleted_at: null, archived_at: null }];
  mockGoals = [];
  mockDoc = { v: 1, rules: [] };
  mockDsr = null;
  mockGrow = { saving: null, investing: null };
  mockFacts = facts();
});

describe('pure rules', () => {
  it('reads due days: valid and changed ones only, blanks change nothing', () => {
    const rows = [{ id: 'a', due_day: null }, { id: 'b', due_day: 5 }, { id: 'c', due_day: 9 }];
    expect(dueDayEdits(rows, { a: '12', b: '5', c: '' })).toEqual([{ id: 'a', day: 12 }]);
    expect(hasBadDueDay({ a: '32' })).toBe(true);
    expect(hasBadDueDay({ a: '' })).toBe(false);
  });

  it('counts rules on, including old engine lines', () => {
    expect(rulesOnCount(0, null)).toBe(0);
    expect(rulesOnCount(2, null)).toBe(2);
    expect(rulesOnCount(0, 1)).toBe(1);
    expect(rulesOnCount(3, 1)).toBe(3);
  });

  it('D-11: the this-month check holds at 10 days and fails at 11', () => {
    expect(recordChecks(facts({ newestEntryThisMonth: '2026-11-10' }), '2026-11-20').allDone).toBe(true);
    expect(recordChecks(facts({ newestEntryThisMonth: '2026-11-09' }), '2026-11-20').thisMonth).toBe(false);
    expect(recordChecks(facts({ lastMonthComplete: false }), '2026-11-20').allDone).toBe(false);
    expect(recordChecks(facts({ accountsAllHaveUse: false }), '2026-11-20').allDone).toBe(false);
  });

  it('account-use choices map both ways; Savings or goals needs the account sheet', () => {
    expect(USE_CHOICES).toEqual(['everyday', 'savings', 'net', 'notSpending']);
    expect(accountUseOfChoice('everyday')).toEqual({ kind: 'everyday' });
    expect(accountUseOfChoice('net')).toEqual({ kind: 'dedicated', purpose: { kind: 'emergency' } });
    expect(accountUseOfChoice('savings')).toBeNull();
    expect(choiceOfUse({ kind: 'untouched' })).toBe('notSpending');
    expect(choiceOfUse(null)).toBeNull();
  });
});

describe('DebtsSetup (D34)', () => {
  it('saves the typed due day on the Grow debt through the injected writer', async () => {
    const saveDueDay = jest.fn(() => 'step-day');
    await wrap(<DebtsSetup saveDueDay={saveDueDay} />);
    expect(screen.getByText('Due day: not set')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Due day of the month'), '12');
    await fireEvent.press(screen.getByText('Save debts'));
    expect(saveDueDay).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), 12, 'u1');
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('"No other debts" sets the flag when saved', async () => {
    mockDebts = [];
    await wrap(<DebtsSetup saveDueDay={jest.fn(() => 'x')} />);
    await fireEvent.press(screen.getByLabelText('No other debts'));
    await fireEvent.press(screen.getByText('Save debts'));
    expect(mockSetAnswered).toHaveBeenCalledWith({ flag: 'no_debts', on: true });
  });

  it('keeps the primary off while a due day is not a day of the month', async () => {
    await wrap(<DebtsSetup saveDueDay={jest.fn(() => 'x')} />);
    await fireEvent.changeText(screen.getByLabelText('Due day of the month'), '40');
    await fireEvent.press(screen.getByText('Save debts'));
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('06.1-65 (FQ4): a typed due day + Save and close saves it once, then leaves', async () => {
    const saveDueDay = jest.fn(() => 'step-day');
    await wrap(<DebtsSetup saveDueDay={saveDueDay} />);
    await fireEvent.changeText(screen.getByLabelText('Due day of the month'), '12');
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(saveDueDay).toHaveBeenCalledTimes(1);
    expect(saveDueDay).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), 12, 'u1');
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('06.1-65 (FQ4): a due day that is not a day of the month + Save and close stays open', async () => {
    const saveDueDay = jest.fn(() => 'x');
    await wrap(<DebtsSetup saveDueDay={saveDueDay} />);
    await fireEvent.changeText(screen.getByLabelText('Due day of the month'), '40');
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(saveDueDay).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('06.1-65: nothing changed + Save and close writes nothing and leaves', async () => {
    const saveDueDay = jest.fn(() => 'x');
    await wrap(<DebtsSetup saveDueDay={saveDueDay} />);
    await fireEvent.press(screen.getByTestId('item-save-close'));
    expect(saveDueDay).not.toHaveBeenCalled();
    expect(mockSetAnswered).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });
});

describe('NetSetup (D35)', () => {
  const answer = jest.fn((): never => ({ status: 'not_set', stepId: 'step-net' }) as never);

  it('with a net: no lock switch here, the lock row links to the safety-net settings, and a changed account is saved on the Grow goal', async () => {
    mockGoals = [{ id: 'g1', household_id: 'h1', is_safety_net: true, deleted_at: null, account_id: null, decide_may_use: false }];
    mockAccounts = [
      { id: 'a1', name: 'Everyday', kind: 'checking', currency: 'USD', deleted_at: null, archived_at: null },
      { id: 'a2', name: 'Savings account', kind: 'savings', currency: 'USD', deleted_at: null, archived_at: null },
    ];
    const setAccount = jest.fn(() => 'step-acc');
    await wrap(<NetSetup answer={answer} setAccount={setAccount} />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(/Locked/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('net-settings-link'));
    expect(mockPush).toHaveBeenCalledWith('/decide/safety-net');
    await fireEvent.press(screen.getByLabelText('Savings account'));
    await fireEvent.press(screen.getByText('Save safety net'));
    expect(setAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }), 'a2', 'u1');
  });

  it('without a net: "Not set yet" goes through the first-answer write', async () => {
    await wrap(<NetSetup answer={answer} setAccount={jest.fn(() => 'x')} />);
    await fireEvent.press(screen.getByLabelText('Not set yet'));
    await fireEvent.press(screen.getByText('Save safety net'));
    expect(answer).toHaveBeenCalledWith({ kind: 'not_set' });
  });
});

describe('RulesSetup (D36)', () => {
  it('with every rule off, saving sets the no-rules flag and the line is shown', async () => {
    await wrap(<RulesSetup />);
    expect(screen.getByTestId('rules-none')).toHaveTextContent('No rules. Answers still keep your safety net.');
    await fireEvent.press(screen.getByText('Save rules'));
    expect(mockSetAnswered).toHaveBeenCalledWith({ flag: 'no_rules', on: true });
    expect(mockDismissTo).toHaveBeenCalledWith('/decide/setup');
  });

  it('with a rule on, saving clears the flag and the none line is not shown', async () => {
    mockDsr = '36';
    await wrap(<RulesSetup />);
    expect(screen.queryByTestId('rules-none')).toBeNull();
    await fireEvent.press(screen.getByText('Save rules'));
    expect(mockSetAnswered).toHaveBeenCalledWith({ flag: 'no_rules', on: false });
    // 06.1-65 (CF-9): the "N rules on" toast carries the clear's step id, so it has Undo.
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'decide.screens.setupOthers.rules.toast', params: { count: 1 } }, stepId: 'step-flag' }));
  });

  it('06.1-65 (CF-9): with the flag already clear (nothing written), the rules toast has no step', async () => {
    mockDsr = '36';
    mockSetAnswered.mockReturnValueOnce(null as never);
    await wrap(<RulesSetup />);
    await fireEvent.press(screen.getByText('Save rules'));
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: null }));
  });

  it('06.1-65 (CB-15): at the five-rule cap, the chip of a rule with no value is disabled and the cap line sits under it', async () => {
    const own = (id: string) => ({ id, kind: 'category_cap', on: true, value: 1000, categoryId: 'c1' });
    mockDoc = { v: 1, rules: [own('r1'), own('r2'), own('r3'), own('r4'), own('r5')] };
    await wrap(<RulesSetup />);
    const keepChip = screen.getByLabelText('Keep at least Not set, change');
    expect(keepChip.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('rule-cap-keep')).toHaveTextContent('Five of your own rules are saved, the most Decide keeps.');
    expect(screen.getByTestId('rule-cap-largest')).toBeTruthy();
    // a stored rule's chip still opens its sheet, and the debt rule is never capped
    expect(screen.queryByTestId('rule-cap-r1')).toBeNull();
    expect(screen.queryByTestId('rule-cap-debt')).toBeNull();
    expect(screen.getByLabelText('Debt payments at most Not set, change').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('06.1-65 (CB-15): under the cap no chip is disabled and no cap line shows beside a chip', async () => {
    await wrap(<RulesSetup />);
    expect(screen.getByLabelText('Keep at least Not set, change').props.accessibilityState?.disabled).toBeFalsy();
    expect(screen.queryByTestId('rule-cap-keep')).toBeNull();
  });

  it('switching the debt rule on writes the typed share at once', async () => {
    await wrap(<RulesSetup />);
    await fireEvent.press(screen.getByLabelText('Debt payments at most'));
    expect(mockRuleSave).toHaveBeenCalledWith({ dsrLine: '36' }, 'ruleEdited');
  });

  // 06.1-79 (DS-8, OQ-79-1 A): the device showed "Saving at least $800" as On on Decide home while this page said "No rules".
  it("Grow's regular saving is a rule here too: set in Grow, a link to Grow, no switch, and no \"No rules\" line", async () => {
    mockGrow = { saving: 80000, investing: null };
    await wrap(<RulesSetup />);
    expect(screen.getByTestId('rule-saving')).toHaveTextContent(/Saving at least.*\$800/);
    expect(screen.getByTestId('rule-saving-from-grow')).toHaveTextContent('Set in Grow');
    expect(screen.queryByTestId('rule-investing')).toBeNull();
    expect(screen.queryByTestId('rules-none')).toBeNull();
    await fireEvent.press(screen.getByTestId('rule-saving-open-grow'));
    expect(mockPush).toHaveBeenCalledWith('/grow');
    await fireEvent.press(screen.getByText('Save rules'));
    expect(mockSetAnswered).toHaveBeenCalledWith({ flag: 'no_rules', on: false });
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'decide.screens.setupOthers.rules.toast', params: { count: 1 } } }));
  });

  it('a stored Keep at least sits once, with its value, and Largest stays a Not set row', async () => {
    mockDoc = { v: 1, rules: [{ id: 'own_keep', kind: 'keep', on: true, value: 30000, categoryId: null }] };
    mockGrow = { saving: null, investing: 5000 };
    await wrap(<RulesSetup />);
    expect(screen.getAllByTestId('rule-keep')).toHaveLength(1);
    expect(screen.getByTestId('rule-keep')).toHaveTextContent(/\$300 left a month/);
    expect(screen.getByTestId('rule-largest')).toHaveTextContent(/Not set/);
    expect(screen.getByTestId('rule-investing-from-grow')).toHaveTextContent('Set in Grow');
  });

  it('says rule, never line', async () => {
    mockDsr = '36';
    await wrap(<RulesSetup />);
    const all = JSON.stringify(screen.toJSON());
    expect(/\bline\b/i.test(all.replace(/"accessibilityLabel"/g, ''))).toBe(false);
  });
});

describe('RecordsSetup (D37, D37b)', () => {
  // 06.1-79 (DS-10, OQ-79-2 A): three months marked full, the answer uses two; Records says the answer's count, as home does.
  it('the months line is the answer’s count of months complete enough to use, not the full-month count', async () => {
    mockInputs = { accounts: [], months: ['2026-08', '2026-09', '2026-10'].map((month) => ({ month, full: true, lines: [] })) };
    mockEvaluation = { result: { confidence: { basis: { kind: 'partial', used: 2, lookedFor: 3, upTo: '2026-11-10' } } }, month: { monthsUsed: ['2026-08', '2026-10'] } };
    await wrap(<RecordsSetup writes={RECORDS_WRITES} />);
    await fireEvent.press(screen.getByTestId('records-more'));
    expect(screen.getByTestId('months-so-far')).toHaveTextContent('Months complete enough to use: 2 of 3.');
  });

  it('Done is active only when all three checks hold', async () => {
    await wrap(<RecordsSetup writes={RECORDS_WRITES} />);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Save and close', { exact: true })).toBeTruthy(); // the frame's top-right link stays
  });

  it('an 11-day-old newest entry leaves the button as Save and close and names the open check', async () => {
    mockFacts = facts({ newestEntryThisMonth: '2026-11-09' });
    await wrap(<RecordsSetup writes={RECORDS_WRITES} />);
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.getAllByText('Save and close').length).toBe(2);
    expect(screen.getByTestId('check-this')).toHaveTextContent(/Not complete/);
  });

  it('open accounts show the plain four choices and write a plain choice through Accounts', async () => {
    mockFacts = facts({ accountsAllHaveUse: false });
    mockInputs = { accounts: [{ id: 'a1', kind: 'checking', use: null, balance: 0 }], months: [{ month: '2026-10', full: true, lines: [] }] };
    await wrap(<RecordsSetup writes={RECORDS_WRITES} />);
    // 06.1-58 (A-SU-5): the choices sit in the Your accounts sheet
    await fireEvent.press(screen.getByTestId('check-accounts'));
    for (const label of ['Everyday spending', 'Savings or goals', 'Safety net', 'Not used for spending']) expect(screen.getByLabelText(label)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Not used for spending'));
    expect(mockSaveUse).toHaveBeenCalledWith({ account: expect.objectContaining({ id: 'a1' }), use: { kind: 'untouched' } });
  });

  it('a person with no records sees the empty variant and a way to quick estimates', async () => {
    mockFacts = facts({ lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false });
    mockInputs = { accounts: [], months: [] };
    await wrap(<RecordsSetup writes={RECORDS_WRITES} />);
    expect(screen.getByTestId('records-empty')).toBeTruthy();
    await fireEvent.press(screen.getByText('Answer from quick estimates for now'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/setup/quick-estimates', params: { mode: 'save' } });
  });
});
