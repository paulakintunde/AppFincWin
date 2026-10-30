/** Plan 05.3-34: the review screen fits the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0, with decided and to-check cards. */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { RefineScreen } from '../RefineScreen';

jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u', householdId: 'h', today: '2026-10-30', homeCurrency: 'USD' }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useStampRefine: () => ({ markShown: jest.fn(), snooze: jest.fn() }) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('../useRefine', () => {
  const { minorUnits: m } = jest.requireActual('@/engine/money');
  const cards = [
    { kind: 'pay', ref: 'pay1', month: null, current: m(300000), suggested: m(320000), noise: m(5000) },
    { kind: 'everyday', ref: null, month: null, current: m(90000), suggested: m(110000), noise: m(5000) },
    { kind: 'saving_bucket', ref: 'pot1', month: null, current: m(20000), suggested: null, noise: null },
    { kind: 'under_logged_month', ref: null, month: '2026-09', current: null, suggested: null, noise: null },
  ];
  return { useRefine: () => ({ result: { due: true, triggers: ['three_months'], cards }, snoozed: false, asOf: '2026-10-30' }) };
});
jest.mock('../useRefineChoices', () => {
  return {
    useRefineChoices: () => ({ choose: jest.fn(), decided: new Map([['pay:pay1', 'updated']]), pot: null, closePot: jest.fn() }),
  };
});
jest.mock('../../shared/useV3Format', () => {
  const money = (n: number) => `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const f = { money, moneyA11y: (n: number) => `${money(n)} dollars`, monthYear: (ym: string) => `September 2026 ${ym}`, month: (ym: string) => ym, date: (d: string) => d };
  return { useV3Format: () => f };
});
jest.mock('../../../pots/PotSheet', () => ({ PotSheet: () => null }));
jest.mock('../../../setup/DebtSheet', () => ({ DebtSheetHost: () => null }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = jest.requireActual('react-native');
  return { DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => <View><Text accessibilityRole="header">{title}</Text>{children}</View> };
});

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

describe('The refine review screen fits the R6 checks', () => {
  for (const m of MATRIX) {
    it(`at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <FontScaleProvider value={mockScale}>
              <RefineScreen />
            </FontScaleProvider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
      expect(screen.getByText('Refine Decide · 1 of 4 checked')).toBeTruthy();
      expectFits();
      await cleanup();
    });
  }
});
