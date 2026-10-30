/** Plan 05.3-28: the whole plan fits the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0, including a 120-month term. */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PlanCard, Purchase, QuotedCheck } from '@/engine/decide/v3';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { WholePlanScreen } from '../WholePlanScreen';
import { SAM, build } from './planFixture';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
let mockBuilt: { purchase: Purchase; card: PlanCard; quoted: QuotedCheck } = build(SAM);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/data/queries/decideCheckV3', () => ({
  useCheckV3: () => ({
    status: 'ready',
    row: { id: 'c1', name: 'A very long item name for a used car with every option', inputs: {} },
    evaluation: { purchase: mockBuilt.purchase, planCard: mockBuilt.card, quoted: mockBuilt.quoted },
  }),
}));
jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return {
    ...actual,
    readStoredCheck: () => ({
      check: { taxPercent: null, pay: { mode: 'plan', apr: jest.requireActual('@/engine/payoff').percent('6.9'), deposit: 500_000 } },
      reasons: [],
    }),
  };
});
jest.mock('../../shared/useV3Format', () => {
  const money = (n: number) => `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const f = { money, moneyA11y: (n: number) => `${money(n)} dollars`, monthYear: (ym: string) => `Month ${ym}`, month: (ym: string) => ym, date: (d: string) => d };
  return { useV3Format: () => f };
});
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = jest.requireActual('react-native');
  return { DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => <View><Text accessibilityRole="header">{title}</Text>{children}</View> };
});

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

describe('the whole plan fits the R6 checks', () => {
  for (const term of [60, 120]) {
    for (const m of MATRIX) {
      it(`${term} months at ${matrixName(m)}`, async () => {
        mockWidth = m.width;
        mockScale = m.scale;
        mockBuilt = build({ ...SAM, count: term });
        await render(
          <SafeAreaProvider initialMetrics={METRICS}>
            <ThemeProvider>
              <FontScaleProvider value={mockScale}>
                <WholePlanScreen id="c1" />
              </FontScaleProvider>
            </ThemeProvider>
          </SafeAreaProvider>,
        );
        expect(screen.getByText(`Total over ${term} months`)).toBeTruthy();
        expect(screen.getByText('Down payment (paid today)')).toBeTruthy();
        // figures are one line (rule N) and shrink, so the only clamps are the figures themselves
        expectFits();
        await cleanup();
      });
    }
  }
});
