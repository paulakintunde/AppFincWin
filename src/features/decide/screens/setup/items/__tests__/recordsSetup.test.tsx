// 06.1-45 (G-1, C-4, C-5): the Records page lists every open readiness item with the answer screen's fixes and answers, leads with
// an envelope summary row, and "Save and close" with items still open says what is open. Done needs the list empty (GQ2).
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
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, dismissTo: mockDismissTo, push: mockPush, back: jest.fn() }) }));
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
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('../../../home/useHomeFacts', () => ({
  footerFactsOf: (i: { months: { full: boolean; lines: unknown[] }[] } | null) => ({ months: i === null ? 0 : i.months.filter((m) => m.full).length, entries: i === null ? 0 : i.months.reduce((n, m) => n + m.lines.length, 0) }),
}));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: jest.fn() }) }));
jest.mock('@/features/record/accounts/AccountUseSheet', () => ({ AccountUseSheet: () => null }));
const mockSaveAnswer = jest.fn((..._a: unknown[]) => ({ stepId: 'step-answer' }) as { stepId: string } | null);
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: mockSaveAnswer }) }));
let mockCached: [unknown, unknown][] = [];
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueryClient: () => ({ getQueriesData: () => mockCached }) }));
jest.mock('../../../sheets/EnvelopeAccountSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return { EnvelopeAccountSheet: ({ goalId }: { goalId: string }) => <Text testID="envelope-sheet">{goalId}</Text> };
});

let mockFacts: SetupFacts | null = null;
jest.mock('../../useSetupProgress', () => ({ useSetupFacts: () => ({ loading: mockFacts === null, facts: mockFacts, currency: 'USD', today: '2026-11-20' }) }));

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

let writes: RecordsWrites & { skipLine: jest.Mock; setEnvelopeAccount: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockFacts = { ...DONE_FACTS };
  mockItems = [];
  mockCached = [];
  mockInputs = { accounts: [], months: [{ month: '2026-10', full: true, lines: [{}] }] };
  writes = { skipLine: jest.fn(() => 'step-skip'), setEnvelopeAccount: jest.fn(() => 'step-env') };
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
