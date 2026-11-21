// 08.1-21 (DCU-10): the Records setup item shows the import prompt and the months-complete line below 3 months of records, and
// nothing above them. The Records done rule (06.1-45 / 06.1-25 D-11) is untouched.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import type { SetupFacts } from '../../logic/setupProgress';
import { RecordsSetup, type RecordsWrites } from '../items/RecordsSetup';

jest.setTimeout(60000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), dismissTo: jest.fn(), push: mockPush, back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn(), hapticWarn: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-20' }),
}));
let mockMonths = 0;
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({
    inputs: { accounts: [], months: [{ month: '2026-10', full: true, lines: [{ role: 'spending' }] }] },
    evaluation: {
      result: { readiness: { ready: true, missing: [], items: [] }, confidence: { basis: { kind: 'records', months: mockMonths } } },
      month: { monthsUsed: Array.from({ length: mockMonths }, (_, i) => `2026-0${i + 1}`) },
    },
  }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('../../home/useHomeFacts', () => ({ footerFactsOf: () => ({ months: 1, entries: 1 }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: jest.fn() }) }));
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: jest.fn() }), useRemoveDecideAnswer: () => ({ remove: jest.fn() }) }));
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => ({ data: [] }) }));
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: [] }) }));
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueryClient: () => ({ getQueriesData: () => [] }) }));
jest.mock('../../sheets/EnvelopeAccountSheet', () => ({ EnvelopeAccountSheet: () => null }));
const FACTS: SetupFacts = {
  hasPay: true, payAmountMinor: 320000, payDay: 15, billsRightAnswered: true, billsCount: 3, billsMonthlyMinor: 100000,
  debts: [], noDebtsAnswered: true, netSizeMinor: null, netNotSetAnswered: true, rulesOn: 0, noRulesAnswered: true,
  lastMonthComplete: true, newestEntryThisMonth: '2026-11-18', accountsAllHaveUse: true, recordsUpTo: '2026-11-18',
  readinessOpen: 0, readinessFirst: null,
};
jest.mock('../useSetupProgress', () => ({ useSetupFacts: () => ({ loading: false, facts: FACTS, currency: 'USD', today: '2026-11-20', retry: jest.fn() }) }));

const writes: RecordsWrites = { skipLine: jest.fn(() => 'x'), setEnvelopeAccount: jest.fn(() => 'x'), clearEnvelopeAccount: jest.fn(() => 'x') };

beforeEach(() => jest.clearAllMocks());

describe('Records setup import prompt', () => {
  it('shows the first prompt and the months line at 0 months, and opens /import returning to Decide', async () => {
    mockMonths = 0;
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByText('Import your last 3 statements')).toBeTruthy();
    expect(screen.getByText('Months complete enough to use: 0 of 3.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('import-prompt'));
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/import', params: { entry: 'you', from: 'decide' } });
  });

  it('shows add-earlier-months at 2 months', async () => {
    mockMonths = 2;
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.getByText('Add past months')).toBeTruthy();
    expect(screen.getByText('Months complete enough to use: 2 of 3.')).toBeTruthy();
  });

  it('is hidden at 3 months and the done state is unchanged', async () => {
    mockMonths = 3;
    await wrap(<RecordsSetup writes={writes} />);
    expect(screen.queryByTestId('records-import')).toBeNull();
    expect(screen.queryByTestId('import-prompt')).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
  });
});
