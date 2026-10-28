/**
 * Plan 05.2-34: Decide settings fits the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0, with long values and effect
 * lines (nothing truncated or clipped) and the Needed word showing.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { MATRIX, expectFits, matrixName } from '../../__tests__/helpers/r18Fit';
import type { SetupFacts } from '../../setup/setupFlow';
import { DecideSettingsScreen } from '../DecideSettingsScreen';
import type { SettingsData } from '../settingsRows';

jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));

const FACTS: SetupFacts = {
  incomeTypes: ['salary_or_wages', 'freelance'],
  hasRegularPaySeries: true,
  method: 'steady',
  spreadMonths: null,
  steadyAmount: 350000,
  holdMonths: null,
  fullMonthsOfRecords: 6,
  moneyAccountIds: ['a1', 'a2', 'a3'],
  accountIdsWithUse: ['a1', 'a2'],
  everydayOverride: null,
  unspentAnchorSet: false,
  roughTyped: false,
  setupDoneAt: null,
};

const DATA: SettingsData = {
  settings: {
    income_types: ['salary_or_wages', 'freelance'],
    income_pattern: 'seasonal',
    variable_method: 'steady',
    steady_amount: 350000,
    everyday_override: 123456789,
    month_marks: { '2026-08': 'out' },
    share_pct: 50,
    detail: 'full',
    remind_plan: true,
    remind_unspent: true,
  },
  regularPay: { amount: 123456789, frequency: 'fortnightly', nextDate: '2026-11-01' },
  otherIncomeCount: 12,
  regularConfirmed: 12,
  loansCount: 3,
  saving: { monthly: 123456789, mode: 'fixed', buckets: 5 },
  everyday: 123456789,
  accountUse: { set: 2, total: 3 },
  emergency: { amount: 90000000, accountName: 'High-interest savings with a very long account name' },
  envelopes: { amount: 250000, count: 3 },
  unspent: null,
};

jest.mock('../useSettingsData', () => ({ useSettingsData: () => ({ facts: FACTS, data: DATA, currency: 'USD' }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15' }),
}));
jest.mock('@/data/mutations/decideSetup', () => ({ useResetDecideSetup: () => ({ reset: jest.fn() }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('../../setup/EmergencyFundSheet', () => ({ EmergencyFundSheet: () => null }));
jest.mock('../../setup/UnspentSheet', () => ({ UnspentSheet: () => null }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = require('react-native');
  return {
    DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <View>
        <Text accessibilityRole="header">{title}</Text>
        {children}
      </View>
    ),
  };
});

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

describe('Decide settings fits the R6 checks', () => {
  for (const m of MATRIX) {
    it(`at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <FontScaleProvider value={mockScale}>
              <DecideSettingsScreen />
            </FontScaleProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      );
      expect(screen.getAllByText('Needed').length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Reset Decide setup')).toBeTruthy();
      expectFits();
      await cleanup();
    });
  }
});
