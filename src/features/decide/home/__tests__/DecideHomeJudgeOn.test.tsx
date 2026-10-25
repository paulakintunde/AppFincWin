// D-107 (05-140): the Judge-on choice end to end on the real Decide home: the real card, the real quick check, the real
// useChooseJudgeOn and the real store. Only the data edges (snapshot query, settings write, checks) are stubbed.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { resetJudgeOnStoreForTest } from '../../judgeOn/judgeOnStore';
import { DecideHomeScreen } from '../DecideHomeScreen';

jest.setTimeout(60000);

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
let mockStored: 'month' | 'worst' | 'average' | null = null;
let mockSettings: DecideSettingsRow | null = null;
const mockUpdate = jest.fn();
const mockMarkSeen = jest.fn(() => true);

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', timeZone: 'UTC', ready: true }),
}));
jest.mock('@/data/queries/decide', () => {
  const R = require('react');
  const { useJudgeOn: useStore } = require('../../judgeOn/judgeOnStore');
  const { withJudgeOn: judged } = require('../homeRowsModel');
  const { loggedSource: logged, month: mk } = require('../../snapshot/__tests__/helpers/snapshotFixtures');
  return {
    useDecideSnapshot: () => {
      const { judgeOn } = useStore('u1');
      const result = R.useMemo(() => {
        if (judgeOn === null) return null;
        const months = [
          ['2026-06', 500_000],
          ['2026-07', 900_000],
          ['2026-08', 100_000],
          ['2026-09', 700_000],
        ].map(([m, income]: (string | number)[]) => mk(m as string, income as number, 300_000));
        return judged(logged({ months }), judgeOn);
      }, [judgeOn]);
      return { status: result === null ? 'loading' : 'ready', result, source: null, retry: () => undefined };
    },
    useDecideChecks: () => ({ data: [] }),
    useOpenChecks: () => ({ data: [] }),
    useDecideSettings: () => ({ data: mockSettings }),
    useDecideChanges: () => ({ data: [] }),
    useDebts: () => ({ data: [] }),
    useOtherChecks: () => ({ otherChecks: [], openCount: 0, leftOutIncomplete: 0, leftOutCurrency: 0 }),
  };
});
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: mockUpdate }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useCreateCheck: () => ({ create: jest.fn() }),
  useMarkCheckSeen: () => ({ markSeen: mockMarkSeen }),
}));
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: jest.fn() }),
  useEditChange: () => ({ edit: jest.fn() }),
  useRemoveChange: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/decideLinks', () => ({ useSaveCardTerms: () => ({ save: jest.fn() }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('../../notifications/waitReminder', () => ({ reconcileWaitReminders: () => Promise.resolve() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/fab/FabProvider', () => ({ useRegisterFab: jest.fn(), useProvideQuickAction: jest.fn() }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null, inFlightOldestAt: null, oldestPendingAt: null }),
}));
jest.mock('../../hints/decideHints', () => ({
  loadHomeBasisSeen: () => Promise.resolve(true),
  markHomeBasisSeen: () => Promise.resolve(),
  loadJudgeOn: () => Promise.resolve(mockStored),
  saveJudgeOn: () => Promise.resolve(),
  loadJudgeOnDefaulted: () => Promise.resolve(true),
  markJudgeOnDefaulted: () => Promise.resolve(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('../checkHref', () => ({ ...jest.requireActual('../checkHref'), openNewCheck: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { TabRootScreen: (p: { children: React.ReactNode }) => R.createElement(View, null, p.children) };
});
jest.mock('@/ui/Sheet', () => {
  const R = require('react');
  return {
    Sheet: (p: { visible: boolean; children: React.ReactNode }) => (p.visible ? R.createElement(R.Fragment, null, p.children) : null),
    SheetScroll: (p: { children: React.ReactNode }) => R.createElement(R.Fragment, null, p.children),
  };
});

async function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <DecideHomeScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/** The card's sub-line names the basis the card and the snapshot are built on. */
const SUB = {
  month: /^this month, after spending/,
  worst: /^in your worst month, after spending/,
  average: /^in your average month, after spending/,
};

beforeEach(() => {
  jest.clearAllMocks();
  resetJudgeOnStoreForTest();
  mockStored = null;
  mockSettings = null;
});

describe('Decide home Judge-on (D-107)', () => {
  it('D-107 the card opens on This month for an account with a stored Worst basis', async () => {
    mockSettings = { user_id: 'u1', basis_override: 'worst' } as DecideSettingsRow;
    await renderHome();
    expect(await screen.findByText('This month ▾')).toBeTruthy();
    expect(screen.getByText(SUB.month)).toBeTruthy();
  });

  it('D-107 choosing Worst writes basis_override once and changes the card and a quick check together', async () => {
    await renderHome();
    await screen.findByText('This month ▾');
    await fireEvent.changeText(screen.getByLabelText('Quick check, something and a price'), 'sofa 1800');
    await fireEvent.press(screen.getByText('Check it'));
    await screen.findByText('Run the full check');
    const summary = () => screen.getByText(/ (free|overspent) · In .* · Out /).props.children as string;
    const before = summary();

    await fireEvent.press(screen.getByLabelText('Judged on This month. Opens the choices.'));
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Worst month'));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ basis_override: 'worst' });
    expect(await screen.findByText('Worst month ▾')).toBeTruthy();
    // the card's hero summary (quick result open) and the check both moved to the worst month
    await waitFor(() => expect(summary()).not.toBe(before));
    await fireEvent.press(screen.getByLabelText('Clear the quick check'));
    expect(await screen.findByText(SUB.worst)).toBeTruthy();
  });

  it('D-107 choosing This month writes no setting', async () => {
    mockStored = 'worst';
    await renderHome();
    await screen.findByText('Worst month ▾');
    await fireEvent.press(screen.getByLabelText('Judged on Worst month. Opens the choices.'));
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('This month'));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(await screen.findByText('This month ▾')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('D-107 a settings load after the stored choice does not flip the card', async () => {
    mockStored = 'average';
    await renderHome();
    expect(await screen.findByText('Average month ▾')).toBeTruthy();
    mockSettings = { user_id: 'u1', basis_override: 'worst' } as DecideSettingsRow;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByText('Average month ▾')).toBeTruthy();
    expect(screen.getByText(SUB.average)).toBeTruthy();
  });
});
