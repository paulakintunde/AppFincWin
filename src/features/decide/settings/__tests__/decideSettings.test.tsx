/**
 * Plan 05.2-34: Decide settings. Row navigation targets, the sheets, the Rough chip and Finish setup, and Reset.
 * (Edit-one-step itself is the stepper's `only` mode, tested in SetupStepper.test.tsx.)
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { SetupFacts } from '../../setup/setupFlow';
import { DecideSettingsScreen } from '../DecideSettingsScreen';
import type { SettingsData } from '../settingsRows';

jest.setTimeout(30000);

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

const FACTS: SetupFacts = {
  incomeTypes: ['salary_or_wages'],
  hasRegularPaySeries: true,
  method: null,
  spreadMonths: null,
  steadyAmount: null,
  holdMonths: null,
  fullMonthsOfRecords: 4,
  moneyAccountIds: ['a1'],
  accountIdsWithUse: ['a1'],
  everydayOverride: null,
  unspentAnchorSet: true,
  roughTyped: false,
  setupDoneAt: '2026-10-01T00:00:00Z',
};

const DATA: SettingsData = {
  settings: {
    income_types: ['salary_or_wages'],
    income_pattern: null,
    variable_method: null,
    steady_amount: null,
    everyday_override: null,
    month_marks: null,
    share_pct: null,
    detail: 'short',
    remind_plan: null,
    remind_unspent: null,
  },
  regularPay: { amount: 400000, frequency: 'monthly', nextDate: '2026-11-01' },
  otherIncomeCount: 0,
  regularConfirmed: 3,
  loansCount: 0,
  saving: null,
  everyday: 120000,
  accountUse: { set: 1, total: 1 },
  emergency: null,
  envelopes: { amount: 0, count: 0 },
  unspent: { amount: 240000, at: '2026-10-03' },
};

let mockLoaded: { facts: SetupFacts; data: SettingsData; currency: string } | null;
const mockPush = jest.fn();
const mockReset = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../useSettingsData', () => ({ useSettingsData: () => mockLoaded }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15' }),
}));
jest.mock('@/data/mutations/decideSetup', () => ({ useResetDecideSetup: () => ({ reset: () => mockReset() }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = require('react-native');
  return {
    DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <View>
        <Text accessibilityRole="header">{`screen:${title}`}</Text>
        {children}
      </View>
    ),
  };
});
jest.mock('../../setup/EmergencyFundSheet', () => {
  const { Text } = require('react-native');
  return { EmergencyFundSheet: ({ visible }: { visible: boolean }) => (visible ? <Text testID="sheet-emergency" /> : null) };
});
jest.mock('../../setup/UnspentSheet', () => {
  const { Text, Pressable } = require('react-native');
  return {
    UnspentSheet: ({ visible, onSetThem }: { visible: boolean; onSetThem?: () => void }) =>
      visible ? (
        <Pressable accessibilityLabel="set-them" onPress={onSetThem}>
          <Text testID="sheet-unspent" />
        </Pressable>
      ) : null,
  };
});

async function mount() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider>
          <DecideSettingsScreen />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const rowByLabel = (label: string) => screen.getByLabelText(new RegExp(`^${label},`));

beforeEach(() => {
  mockLoaded = { facts: FACTS, data: DATA, currency: 'USD' };
  mockPush.mockClear();
  mockReset.mockReset();
  mockShowToast.mockClear();
});

describe('Decide settings', () => {
  it('lists the five sections with a value and an effect line per row', async () => {
    await mount();
    expect(screen.getByText('screen:Decide settings')).toBeTruthy();
    const headers = screen.getAllByRole('header').map((h) => String(h.props.children));
    expect(headers).toEqual(expect.arrayContaining(['screen:Decide settings', 'Income', 'Regular payments', 'Spending', 'Your money now', 'Answers']));
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.getByText('Steady pay and changing pay are checked in different ways.')).toBeTruthy();
    expect(screen.getByText(/^\$4,000 monthly, next /)).toBeTruthy();
  });

  it('says "Not set" for an unanswered optional row and "Needed" for a needed one', async () => {
    mockLoaded = { facts: { ...FACTS, unspentAnchorSet: false }, data: { ...DATA, unspent: null }, currency: 'USD' };
    await mount();
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Needed')).toHaveLength(1);
  });

  it('shows no Rough chip or Finish setup when every needed step is answered', async () => {
    await mount();
    expect(screen.queryByText('Rough')).toBeNull();
    expect(screen.queryByLabelText('Finish setup')).toBeNull();
  });

  it('Finish setup resumes at the first unanswered needed step', async () => {
    mockLoaded = { facts: { ...FACTS, unspentAnchorSet: false }, data: { ...DATA, unspent: null }, currency: 'USD' };
    await mount();
    expect(screen.getByText('Rough')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Finish setup'));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup?startAt=unspent');
  });

  it('a row opens only its step in edit mode', async () => {
    await mount();
    await fireEvent.press(rowByLabel('Everyday spending'));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup?only=everyday');
    await fireEvent.press(rowByLabel('What each account is for'));
    expect(mockPush).toHaveBeenLastCalledWith('/decide/setup?only=accountUse');
  });

  it('Emergency fund and Unspent money open their sheets, not a step', async () => {
    await mount();
    await fireEvent.press(rowByLabel('Emergency fund'));
    expect(screen.getByTestId('sheet-emergency')).toBeTruthy();
    await fireEvent.press(rowByLabel('Unspent money'));
    expect(screen.getByTestId('sheet-unspent')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('"Set them" on the Unspent sheet opens the account-use step in edit mode', async () => {
    await mount();
    await fireEvent.press(rowByLabel('Unspent money'));
    await fireEvent.press(screen.getByLabelText('set-them'));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup?only=accountUse');
  });

  it('Reset asks first and clears nothing until confirmed', async () => {
    await mount();
    await fireEvent.press(screen.getByLabelText('Reset Decide setup'));
    expect(screen.getByText('Reset Decide setup?')).toBeTruthy();
    expect(screen.getByText('This clears your setup answers only. Your transactions, regular payments, loans and envelopes stay as they are.')).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Keep it'));
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('confirming Reset clears the answers once and shows "Decide setup reset" with the Undo step', async () => {
    mockReset.mockReturnValue({ stepId: 'step-reset' });
    await mount();
    await fireEvent.press(screen.getByLabelText('Reset Decide setup'));
    await fireEvent.press(screen.getByLabelText('Reset'));
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.settings.toastReset' }, stepId: 'step-reset' });
  });

  it('shows no toast when there was nothing to reset', async () => {
    mockReset.mockReturnValue(null);
    await mount();
    await fireEvent.press(screen.getByLabelText('Reset Decide setup'));
    await fireEvent.press(screen.getByLabelText('Reset'));
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
