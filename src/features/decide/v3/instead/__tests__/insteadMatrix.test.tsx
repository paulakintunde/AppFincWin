/** Plan 05.3-29: the instead screen fits the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0, with a typed rate shown. */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { evaluate } from '@/engine/decide/v3';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { loadAllVariableCases } from '../../../../../engine/decide/v3/__tests__/golden/variableIncomeLoader';
import { InsteadScreen } from '../InsteadScreen';

jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: false }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ all: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { live: [], done: [] } }) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
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
const ev = (() => {
  const c = loadAllVariableCases()
    .map((k) => evaluate(k.inputs, k.check))
    .find((e) => e.purchase !== null && e.funds.unspent !== null && e.result.code === 'not_yet' && e.result.readyBy?.kind === 'month');
  if (c === undefined) throw new Error('no fixture');
  return c;
})();

describe('The instead screen fits the R6 checks', () => {
  for (const m of MATRIX) {
    it(`at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <FontScaleProvider value={mockScale}>
              <InsteadScreen ev={ev} />
            </FontScaleProvider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
      await fireEvent.changeText(screen.getByLabelText('Rate from your bank or finance company'), '4.25');
      expect(screen.getByText('4 · Buy it later')).toBeTruthy();
      expectFits();
      await cleanup();
    });
  }
});
