/** Plan 05.3-26: the not-ready card at 320 / 402 wide x 1.0x / 2.0x: rows stack, targets are 44, nothing clamps. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { Readiness } from '@/engine/decide/v3';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { NotReadyCard } from '../NotReadyCard';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/decide/v3/nav/hrefs', () => ({ ENVELOPES_HREF: '/decide/envelopes' }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({
  useV3Format: () => ({ month: (ym: string) => (ym === '2026-09' ? 'September' : 'October') }),
}));

const ALL = { ready: false, missing: ['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing'] } as unknown as Readiness;

describe.each(MATRIX)('NotReadyCard matrix', (cell) => {
  afterEach(cleanup);
  it(`${matrixName(cell)}: rows stack, targets are 44, text is whole`, async () => {
    mockWidth = cell.width;
    mockScale = cell.scale;
    await render(
      <FontScaleProvider>
        <ThemeProvider>
          <NotReadyCard readiness={ALL} thisMonth="2026-10" />
        </ThemeProvider>
      </FontScaleProvider>,
    );
    expectFits();
    expectTargets();
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      // rule S: text above, button below, never side by side
      const flat = StyleSheet.flatten(row.props.style) as { flexDirection?: string };
      expect(flat.flexDirection ?? 'column').toBe('column');
      expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});
