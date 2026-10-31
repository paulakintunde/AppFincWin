/** Plan 05.3-24: the Check screen core fits the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0 (rule S stacking, wrapping chips, visible bar). */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { toStoredV2 } from '@/engine/decide/v3';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { emptyCheck } from '../../model/checkEdits';
import { CheckScreen } from '../CheckScreen';

jest.setTimeout(60000);

const ID = '11111111-1111-4111-8111-111111111111';
let mockScale = 1;
let mockWidth = 402;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideChecks: () => ({ data: [mockRow()] }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useCreateCheck: () => ({ create: jest.fn(), pendingIds: [], pendingRows: [] }),
  useSaveCheckDraft: () => ({ save: jest.fn() }),
  useSaveCheckAnswer: () => ({ save: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({ useMutationState: () => [] }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn(), replaceOnce: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: () => undefined }));
jest.mock('@/shell/header/DetailHeader', () => {
  const { View, Text } = jest.requireActual('react-native');
  return { DetailHeader: ({ title, right }: { title: string; right: React.ReactNode }) => (<View><Text>{title}</Text>{right}</View>) };
});
jest.mock('../../nav/hrefs', () => ({ answerHref: (id: string) => `/decide/answer/${id}` }));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));
jest.mock('@/data/queries/decideCheckV3', () => ({
  useCheckV3: () => ({
    status: 'ready', row: null, withoutRefunds: null, refetch: jest.fn(),
    inputs: {
      thresholds: {
        bandEdges: [5000, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000, 200000000, 500000000, 1000000000],
        unspentDrift: 0, quotedTolerance: 0, source: 'table',
      },
    },
    evaluation: {
      result: { code: 'fits_month', variant: null, facts: [], readyBy: null, band: 12, layers: ['L0', 'L1p', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'], confidence: { level: 'fair', reasons: [] }, readiness: { ready: true, missing: [] } },
      purchase: { band: 12, layers: ['L0', 'L1p', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] },
    },
  }),
}));
function mockRow() {
  return { id: ID, name: 'A very long item name for a sofa that keeps going', status: 'open', furthest_step: 1, version: 1, created_by: 'u1', household_id: 'h1', inputs: toStoredV2(emptyCheck()) };
}

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

describe('Check a purchase fits the R6 checks', () => {
  for (const m of MATRIX) {
    it(`at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <FontScaleProvider value={mockScale}>
              <CheckScreen id={ID} focus={null} />
            </FontScaleProvider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
      await fireEvent.changeText(screen.getByLabelText('Price'), '1234567');
      expect(screen.getByLabelText('Check it')).toBeTruthy();
      expect(screen.getByText(/^Band 12/)).toBeTruthy();
      expectFits({ clampCount: 0 });
      await cleanup();
    });
  }
});
