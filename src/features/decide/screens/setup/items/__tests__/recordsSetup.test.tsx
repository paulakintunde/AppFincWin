// 06.1-45 (G-1, C-4, C-5): the Records page lists every open readiness item with the answer screen's fixes and answers, leads with
// an envelope summary row, and "Save and close" with items still open says what is open. Done needs the list empty (GQ2).
// 06.1-65: the loading line (CF-8), where quick estimates go (CN-5 a) and the rough figures with Clear (CC-7).
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import type { ReadinessItem } from '@/engine/decide/v3';
import type { SetupFacts } from '../../../logic/setupProgress';
import { RecordsSetup, type RecordsWrites } from '../RecordsSetup';

jest.setTimeout(60000);

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, push: mockPush, back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-20' }),
}));
let mockInputs: unknown = { accounts: [], months: [{ month: '2026-10', full: true, lines: [{}] }] };
let mockItems: ReadinessItem[] = [];
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({ inputs: mockInputs, evaluation: { result: { readiness: { ready: mockItems.length === 0, missing: [], items: mockItems } } } }),
}));
let mockAccountRows: unknown[] = [];
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccountRows }) }));
jest.mock('../../../home/useHomeFacts', () => ({
  footerFactsOf: (i: { months: { full: boolean; lines: unknown[] }[] } | null) => ({ months: i === null ? 0 : i.months.filter((m) => m.full).length, entries: i === null ? 0 : i.months.reduce((n, m) => n + m.lines.length, 0) }),
}));
// 06.1-65 (CC-7): the rough figures are read from the settings and cleared through the undoable setup save.
let mockSettings: Record<string, unknown> | null = null;
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockSettings }) }));
const mockSetupSave = jest.fn((..._a: unknown[]) => ({ stepId: 'step-clear' }) as { stepId: string } | null);
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: mockSetupSave }) }));
const mockSaveUse = jest.fn((..._a: unknown[]) => ({ stepId: 'step-use' }));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: mockSaveUse }) }));
jest.mock('@/features/record/accounts/AccountUseSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return { AccountUseSheet: ({ account }: { account: { id: string } }) => <Text testID="account-use-sheet">{account.id}</Text> };
});
const mockSaveAnswer = jest.fn((..._a: unknown[]) => ({ stepId: 'step-answer' }) as { stepId: string } | null);
const mockRemoveAnswer = jest.fn((..._a: unknown[]) => ({ stepId: 'step-removed' }));
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: mockSaveAnswer }), useRemoveDecideAnswer: () => ({ remove: mockRemoveAnswer }) }));
// 06.1-68 (FQ7, DC-11): the live answers and the goals the "Answers you gave" list reads.
let mockAnswers: unknown[] = [];
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => ({ data: mockAnswers }) }));
let mockGoals: unknown[] = [];
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockGoals }) }));
let mockCached: [unknown, unknown][] = [];
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueryClient: () => ({ getQueriesData: () => mockCached }) }));
jest.mock('../../../sheets/EnvelopeAccountSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return { EnvelopeAccountSheet: ({ goalId }: { goalId: string }) => <Text testID="envelope-sheet">{goalId}</Text> };
});

let mockFacts: SetupFacts | null = null;
const mockRetry = jest.fn();
jest.mock('../../useSetupProgress', () => ({ useSetupFacts: () => ({ loading: mockFacts === null, facts: mockFacts, currency: 'USD', today: '2026-11-20', retry: mockRetry }) }));

const DONE_FACTS: SetupFacts = {
  hasPay: true, payAmountMinor: 320000, payDay: 15, billsRightAnswered: true, billsCount: 3, billsMonthlyMinor: 100000,
  debts: [], noDebtsAnswered: true, netSizeMinor: null, netNotSetAnswered: true, rulesOn: 0, noRulesAnswered: true,
  lastMonthComplete: true, newestEntryThisMonth: '2026-11-18', accountsAllHaveUse: true, recordsUpTo: '2026-11-18',
  readinessOpen: 0, readinessFirst: null,
};

const item = (over: Partial<ReadinessItem>): ReadinessItem => ({
  kind: 'bill', code: 'past_month_missing', month: '2026-10', seriesId: 's-netflix', envelopeId: null, lineId: null,
  name: 'Netflix', amount: 1199 as ReadinessItem['amount'], date: '2026-10-03', ...over,
});
const BILL = item({});
const PENDING_BILL = item({ seriesId: 's-gym', name: 'Gym', amount: 4000 as ReadinessItem['amount'], date: '2026-11-05', month: '2026-11', code: 'activity_not_current', lineId: 'line-gym' });
const ENVELOPE = item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-11', seriesId: null, envelopeId: 'goal-trip', name: 'Trip', amount: null, date: null });
const ENVELOPE2 = item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-11', seriesId: null, envelopeId: 'goal-car', name: 'Car', amount: null, date: null });

let writes: RecordsWrites & { skipLine: jest.Mock; setEnvelopeAccount: jest.Mock; clearEnvelopeAccount: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockFacts = { ...DONE_FACTS };
  mockParams = {};
  mockSettings = null;
  mockItems = [];
  mockCached = [];
  mockAccountRows = [];
  mockInputs = { accounts: [], months: [{ month: '2026-10', full: true, lines: [{}] }] };
  writes = { skipLine: jest.fn(() => 'step-skip'), setEnvelopeAccount: jest.fn(() => 'step-env'), clearEnvelopeAccount: jest.fn(() => 'step-unlink') };
  mockAnswers = [];
  mockGoals = [];
});

async function press(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
  });
}

describe('RecordsSetup readiness list (06.1-45)', () => {
  it('with nothing open: no list, Done is shown, and Save and close leaves silently', async () => {
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.queryByTestId('records-open')).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
    await press(screen.getByText('Done'));
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });

  it('an open bill item is named with its fix and answers; Done is not offered while it is open (GQ2)', async () => {
    mockItems = [BILL];
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByText('What’s still open')).toBeTruthy();
    expect(screen.getByText('Netflix, $11.99 due Oct 3, 2026, isn’t in your records yet.')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.queryByTestId('records-envelopes')).toBeNull();
    // the answer saves the same waiver as the answer screen, dated today, with one Undo
    await press(screen.getByText('Someone else paid it'));
    expect(mockSaveAnswer).toHaveBeenCalledWith({ kind: 'readiness_waiver', waiver: { kind: 'paid_by_other', seriesId: 's-netflix', date: '2026-10-03' }, at: '2026-11-20' });
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId: 'step-answer' });
    // the records fix opens Activity
    await press(screen.getByTestId('readiness-fix-0'));
    expect(mockPush).toHaveBeenCalledWith('/activity');
  });

  it('a pending line is skipped through the shell writer when cached, else answered by its waiver', async () => {
    mockItems = [PENDING_BILL];
    mockCached = [[['transactions', 'h1'], [{ id: 'line-gym', status: 'pending', deleted_at: null }]]];
    await wrap(<RecordsSetup writes={writes} />);
    const skip = screen.getByText('It didn’t happen');
    await press(skip);
    expect(writes.skipLine).toHaveBeenCalledWith(expect.objectContaining({ id: 'line-gym' }), 'u1');
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId: 'step-skip' });

    mockCached = [];
    mockShowToast.mockClear();
    await press(screen.getByText('It didn’t happen'));
    expect(mockSaveAnswer).toHaveBeenCalledWith({ kind: 'readiness_waiver', waiver: { kind: 'didnt_happen', seriesId: 's-gym', date: '2026-11-05' }, at: '2026-11-20' });
  });

  it('open envelopes lead the group with a summary row, and the envelope fix opens the account sheet', async () => {
    mockItems = [ENVELOPE, ENVELOPE2, BILL];
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('records-envelopes')).toHaveTextContent('Envelopes and goals: 2 not linked');
    await press(screen.getByTestId('readiness-fix-0'));
    expect(screen.getByTestId('envelope-sheet')).toHaveTextContent('goal-trip');
  });

  it('one envelope uses the singular summary', async () => {
    mockItems = [ENVELOPE];
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('records-envelopes')).toHaveTextContent('Envelopes and goals: 1 not linked');
  });

  it('Save and close with items still open says what is open, then leaves (C-5)', async () => {
    mockItems = [ENVELOPE, BILL];
    await wrap(<RecordsSetup writes={writes} />);
    const closes = screen.getAllByText('Save and close');
    await press(closes[closes.length - 1]!);
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.stillOpen', params: { count: 2 } } });
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });

  it('a brand-new person still sees the No records yet variant', async () => {
    mockFacts = { ...DONE_FACTS, lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false };
    mockInputs = { accounts: [], months: [] };
    mockItems = [item({ kind: 'late_start', code: 'past_month_missing', seriesId: null, name: null, amount: null, date: null })];
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('records-empty')).toBeTruthy();
    expect(screen.queryByTestId('records-open')).toBeNull();
  });
});

describe('RecordsSetup loading, quick estimates and rough figures (06.1-65)', () => {
  const BRAND_NEW = { ...DONE_FACTS, lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false };

  it('CF-8: while the facts load, the line says the records are being checked and the primary is off', async () => {
    mockFacts = null;
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('records-loading')).toHaveTextContent('Checking your records…');
    const primary = screen.getAllByRole('button').find((b) => b.props.accessibilityState?.disabled === true);
    expect(primary).toBeTruthy();
  });

  it('CN-5 (a): with no check in view, From quick estimates opens it in save mode', async () => {
    mockFacts = BRAND_NEW;
    mockInputs = { accounts: [], months: [] };
    await wrap(<RecordsSetup writes={writes} />);
    await press(screen.getByText('Answer from quick estimates for now'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/setup/quick-estimates', params: { mode: 'save' } });
  });

  it('CN-5 (a): opened from an answer, From quick estimates passes its returnTo on', async () => {
    mockFacts = BRAND_NEW;
    mockInputs = { accounts: [], months: [] };
    mockParams = { returnTo: '/decide/answer/c1' };
    await wrap(<RecordsSetup writes={writes} />);
    await press(screen.getByText('Answer from quick estimates for now'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/setup/quick-estimates', params: { returnTo: '/decide/answer/c1' } });
  });

  it('CN-5 (a): an unsafe returnTo is not followed (save mode instead)', async () => {
    mockFacts = BRAND_NEW;
    mockInputs = { accounts: [], months: [] };
    mockParams = { returnTo: 'https://example.com' };
    await wrap(<RecordsSetup writes={writes} />);
    await press(screen.getByText('Answer from quick estimates for now'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/setup/quick-estimates', params: { mode: 'save' } });
  });

  it('CC-7: rough figures in use are listed, and Clear writes nulls with an Undo toast', async () => {
    mockSettings = { rough_income: 320000, rough_spending: 277500, rough_as_of: '2026-11-11', currency: 'USD' };
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('records-rough')).toHaveTextContent(/^Quick estimates in use: \$3,200 in, \$2,775 out/);
    await press(screen.getByTestId('records-rough-clear'));
    expect(mockSetupSave).toHaveBeenCalledWith({ stepTitle: 'Quick estimates', patch: { rough_income: null, rough_spending: null, rough_as_of: null } });
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.roughCleared' }, stepId: 'step-clear' });
  });

  it('CC-7: a Clear that writes nothing shows no toast; the brand-new page lists the figures too', async () => {
    mockFacts = BRAND_NEW;
    mockInputs = { accounts: [], months: [] };
    mockSettings = { rough_income: 100000, rough_spending: null, currency: null };
    mockSetupSave.mockReturnValueOnce(null);
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('records-rough')).toHaveTextContent(/^Quick estimates in use: \$1,000 in, \$0 out/);
    await press(screen.getByTestId('records-rough-clear'));
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('CC-7: with no rough figures, no row', async () => {
    mockSettings = { rough_income: null, rough_spending: null };
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.queryByTestId('records-rough')).toBeNull();
  });
});

describe('RecordsSetup rows, badges and the accounts sheet (06.1-58 A-SU-5, DS-16)', () => {
  const ACCOUNTS = [
    { id: 'a1', kind: 'checking', use: null, balance: 0 },
    { id: 'a2', kind: 'checking', use: { kind: 'everyday' }, balance: 0 },
    { id: 'a3', kind: 'cash', use: null, balance: 0 },
  ];
  const ROWS = [
    { id: 'a1', name: 'Everyday', kind: 'checking' },
    { id: 'a2', name: 'Joint', kind: 'checking' },
    { id: 'a3', name: 'Wallet', kind: 'cash' },
  ];

  it('every check carries a word badge and a reason; with all done there is no Check again', async () => {
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('check-last-badge')).toHaveTextContent('Complete');
    expect(screen.getByTestId('check-last')).toHaveTextContent(/In your records to the end of October\./);
    expect(screen.getByTestId('check-this')).toHaveTextContent(/Up to date: entries to Nov 18, 2026/);
    expect(screen.getByTestId('check-accounts')).toHaveTextContent(/0 accounts say what they are for/);
    expect(screen.queryByText('Check again')).toBeNull();
    expect(screen.queryByTestId('last-fix')).toBeNull();
  });

  it('DS-16: an incomplete last month says why and links to the fix; Check again refetches', async () => {
    mockFacts = { ...DONE_FACTS, lastMonthComplete: false, newestEntryThisMonth: '2026-11-02' };
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('check-last-badge')).toHaveTextContent('Not complete');
    expect(screen.getByTestId('check-last')).toHaveTextContent(/Not all of October is in your records yet\./);
    expect(screen.getByTestId('check-this')).toHaveTextContent(/Newest entry Nov 2, 2026\. Decide needs one from the last 10 days\./);
    await press(screen.getByTestId('last-fix'));
    expect(mockPush).toHaveBeenCalledWith('/activity');
    await press(screen.getByText('Check again'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('no entries this month says so', async () => {
    mockFacts = { ...DONE_FACTS, newestEntryThisMonth: null };
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('check-this')).toHaveTextContent(/No entries yet this month\./);
  });

  it('Your accounts is one row that opens a sheet with the per-account choices', async () => {
    mockFacts = { ...DONE_FACTS, accountsAllHaveUse: false };
    mockInputs = { accounts: ACCOUNTS, months: [{ month: '2026-10', full: true, lines: [{}] }] };
    mockAccountRows = ROWS;
    await wrap(<RecordsSetup writes={writes} />);
    // no inline radio rows on the page
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByTestId('check-accounts')).toHaveTextContent(/3 accounts · 2 to finish/);
    expect(screen.getByText('To finish')).toBeTruthy();
    await press(screen.getByTestId('check-accounts'));
    expect(screen.getByText('What is Everyday for?')).toBeTruthy();
    expect(screen.getByText('What is Wallet for?')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(12);
    await press(screen.getAllByLabelText('Not used for spending')[0]!);
    expect(mockSaveUse).toHaveBeenCalledWith({ account: expect.objectContaining({ id: 'a1' }), use: { kind: 'untouched' } });
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.accountUse.toastSaved' }, stepId: 'step-use' });
    // Savings or goals needs the goal, so the account's own sheet takes over
    await press(screen.getAllByLabelText('Savings or goals')[2]!);
    expect(screen.getByTestId('account-use-sheet')).toHaveTextContent('a3');
    expect(screen.queryByText('What is Everyday for?')).toBeNull();
  });

  it('one open account reads in the singular, and Close shuts the sheet', async () => {
    mockFacts = { ...DONE_FACTS, accountsAllHaveUse: false };
    mockInputs = { accounts: [ACCOUNTS[0]], months: [{ month: '2026-10', full: true, lines: [{}] }] };
    mockAccountRows = ROWS;
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('check-accounts')).toHaveTextContent(/1 account · 1 to finish/);
    await press(screen.getByTestId('check-accounts'));
    expect(screen.getByText('What is Everyday for?')).toBeTruthy();
    await press(screen.getByText('Close'));
    expect(screen.queryByText('What is Everyday for?')).toBeNull();
  });
});

describe('06.1-68 (FQ7, CC-5, DC-11): Answers you gave', () => {
  const S1 = '11111111-1111-4111-8111-111111111111';
  const S2 = '22222222-2222-4222-8222-222222222222';
  const answer = (id: string, key: string, created: string, over: Record<string, unknown> = {}) => ({
    id, household_id: 'h1', created_by: 'u1', kind: 'readiness_waiver', key, amount: null, bool_value: null, on_date: '2026-11-10',
    check_id: null, deleted_at: null, version: 1, created_at: created, updated_at: created, ...over,
  });
  const goal = (id: string, name: string, over: Record<string, unknown> = {}) => ({
    id, household_id: 'h1', created_by: 'u1', check_id: null, name, currency: 'USD', target: 100000, monthly_amount: null, ready_by: null,
    opening_saved: 0, kind: 'pot', account_id: 'a2', is_safety_net: false, done_at: null, is_sample: false, deleted_at: null, version: 1,
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...over,
  });
  const NO_PAY = answer('ans-1', `no-pay:${S2}:2026-10-16`, '2026-11-10T09:00:00Z');
  const PAID = answer('ans-2', `paid-by-other:${S1}:2026-10-03`, '2026-11-12T09:00:00Z');

  beforeEach(() => {
    mockInputs = { accounts: [], series: [{ id: S1, name: 'Netflix' }], months: [{ month: '2026-10', full: true, lines: [{}] }] };
    mockAccountRows = [{ id: 'a2', name: 'Joint', kind: 'savings' }];
  });

  it('with nothing given the section is not shown', async () => {
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.queryByTestId('records-given')).toBeNull();
    expect(screen.queryByText('Answers you gave')).toBeNull();
  });

  it('lists live readiness answers newest first, in plain words; deleted and unreadable rows are left out', async () => {
    mockAnswers = [
      NO_PAY,
      PAID,
      answer('ans-3', 'income-elsewhere', '2026-11-11T09:00:00Z', { deleted_at: '2026-11-12T00:00:00Z' }),
      answer('ans-4', 'not-a-waiver', '2026-11-13T09:00:00Z'),
      { ...answer('ans-5', 'x', '2026-11-13T09:00:00Z'), kind: 'volatile_cover' },
    ];
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByText('Answers you gave')).toBeTruthy();
    const lines = screen.getAllByTestId(/^given-ans-\d$/);
    expect(lines.map((n) => n.props.testID)).toEqual(['given-ans-2', 'given-ans-1']);
    expect(lines[0]).toHaveTextContent(/^Netflix, due Oct 3, 2026: someone else paid it/);
    expect(lines[1]).toHaveTextContent(/^Oct 16, 2026 income: didn’t happen/);
    // waivers have no Change
    expect(screen.queryByTestId('given-change-ans-2')).toBeNull();
  });

  it('Remove soft-deletes through the answers writer and shows "Answer removed." with its Undo step', async () => {
    mockAnswers = [NO_PAY, PAID];
    await wrap(<RecordsSetup writes={writes} />);
    const remove = screen.getByTestId('given-remove-ans-1');
    expect(remove.props.accessibilityLabel).toBe('Remove, Oct 16, 2026 income: didn’t happen');
    await press(remove);
    expect(mockRemoveAnswer).toHaveBeenCalledWith(expect.objectContaining({ id: 'ans-1', key: `no-pay:${S2}:2026-10-16` }));
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.answerRemoved' }, stepId: 'step-removed' });
  });

  it('every waiver kind reads in its own words', async () => {
    mockAnswers = [
      answer('w1', `didnt-happen:${S1}:2026-10-03`, '2026-11-09T00:00:00Z'),
      answer('w2', `didnt-happen:${S2}:2026-10-04`, '2026-11-08T00:00:00Z'),
      answer('w3', `paid-by-other:${S2}:2026-10-05`, '2026-11-07T00:00:00Z'),
      answer('w4', `always-other:${S1}`, '2026-11-06T00:00:00Z'),
      answer('w5', `always-other:${S2}`, '2026-11-05T00:00:00Z'),
      answer('w6', `no-pay:${S1}:2026-10-06`, '2026-11-04T00:00:00Z'),
      answer('w7', 'income-elsewhere', '2026-11-03T00:00:00Z'),
      answer('w8', 'nothing-to-add:2026-10', '2026-11-02T00:00:00Z'),
      answer('w9', 'month-complete:2026-09', '2026-11-01T00:00:00Z'),
      answer('w0', 'start-from:2026-08', '2026-11-01T00:00:00Z'),
    ];
    await wrap(<RecordsSetup writes={writes} />);
    const text = (id: string) => screen.getByTestId(`given-${id}`);
    expect(text('w1')).toHaveTextContent(/^Netflix, due Oct 3, 2026: didn’t happen/);
    expect(text('w2')).toHaveTextContent(/^A bill due Oct 4, 2026: didn’t happen/);
    expect(text('w3')).toHaveTextContent(/^A bill due Oct 5, 2026: someone else paid it/);
    expect(text('w4')).toHaveTextContent(/^Netflix: someone else always pays it/);
    expect(text('w5')).toHaveTextContent(/^A bill: someone else always pays it/);
    expect(text('w6')).toHaveTextContent(/^Netflix, Oct 6, 2026: no pay that time/);
    expect(text('w7')).toHaveTextContent(/^Income comes in elsewhere/);
    expect(text('w8')).toHaveTextContent(/^October: nothing more to add/);
    expect(text('w9')).toHaveTextContent(/^September: all recorded/);
    expect(text('w0')).toHaveTextContent(/^Records begin in August/);
  });

  it('DC-11: a goal linked to an account shows with Change (Which account?) and Remove (unlinks, Undo)', async () => {
    mockGoals = [
      goal('g-trip', 'Trip'),
      goal('g-net', 'Safety net', { is_safety_net: true }),
      goal('g-none', 'Car', { account_id: null }),
      goal('g-gone', 'Old', { deleted_at: '2026-11-02T00:00:00Z' }),
      goal('g-done', 'Done one', { done_at: '2026-11-02T00:00:00Z' }),
      goal('g-lost', 'Lost', { account_id: 'a-missing' }),
    ];
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByTestId('given-g-trip')).toHaveTextContent(/^Trip \(a Grow goal\): kept in Joint/);
    for (const id of ['g-net', 'g-none', 'g-gone', 'g-done', 'g-lost']) expect(screen.queryByTestId(`given-${id}`)).toBeNull();
    await press(screen.getByTestId('given-change-g-trip'));
    expect(screen.getByTestId('envelope-sheet')).toHaveTextContent('g-trip');
    await press(screen.getByTestId('given-remove-g-trip'));
    expect(writes.clearEnvelopeAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-trip' }), 'u1');
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.answerRemoved' }, stepId: 'step-unlink' });
  });
});

describe('06.1-68 (DS-14): account-use radios show the pick at once', () => {
  const ROWS = [{ id: 'a1', name: 'Everyday', kind: 'checking' }];
  const open = async () => {
    mockFacts = { ...DONE_FACTS, accountsAllHaveUse: false };
    mockAccountRows = ROWS;
    const view = await wrap(<RecordsSetup writes={writes} />);
    await press(screen.getByTestId('check-accounts'));
    return view;
  };
  const again = async (view: Awaited<ReturnType<typeof open>>) => {
    await act(async () => {
      view.rerender(<RecordsSetup writes={writes} />);
    });
  };
  const radio = (label: string) => screen.getByRole('radio', { name: label });

  it('the tapped choice is checked right after the tap, before the stored use catches up', async () => {
    mockInputs = { accounts: [{ id: 'a1', kind: 'checking', use: null, balance: 0 }], months: [{ month: '2026-10', full: true, lines: [{}] }] };
    await open();
    expect(radio('Not used for spending').props.accessibilityState).toEqual({ selected: false, checked: false });
    await press(radio('Not used for spending'));
    expect(radio('Not used for spending').props.accessibilityState).toEqual({ selected: true, checked: true });
    expect(screen.getAllByRole('radio').filter((n) => n.props.accessibilityState.checked)).toHaveLength(1);
  });

  it('a save that writes nothing draws no pick', async () => {
    mockInputs = { accounts: [{ id: 'a1', kind: 'checking', use: null, balance: 0 }], months: [{ month: '2026-10', full: true, lines: [{}] }] };
    await open();
    mockSaveUse.mockReturnValueOnce(null as never);
    await press(radio('Not used for spending'));
    expect(screen.getAllByRole('radio').filter((n) => n.props.accessibilityState.checked)).toHaveLength(0);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('once the stored use moves, the stored value shows (so a later Undo shows the old one)', async () => {
    mockInputs = { accounts: [{ id: 'a1', kind: 'checking', use: null, balance: 0 }], months: [{ month: '2026-10', full: true, lines: [{}] }] };
    const view = await open();
    await press(radio('Not used for spending'));
    // the write lands
    mockInputs = { accounts: [{ id: 'a1', kind: 'checking', use: { kind: 'untouched' }, balance: 0 }], months: [{ month: '2026-10', full: true, lines: [{}] }] };
    await again(view);
    expect(radio('Not used for spending').props.accessibilityState.checked).toBe(true);
    // Undo puts the old (no use) back: nothing is checked
    mockInputs = { accounts: [{ id: 'a1', kind: 'checking', use: null, balance: 0 }], months: [{ month: '2026-10', full: true, lines: [{}] }] };
    await again(view);
    expect(screen.getAllByRole('radio').filter((n) => n.props.accessibilityState.checked)).toHaveLength(0);
  });
});
