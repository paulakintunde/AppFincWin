/** 05.3-50 F1/F2: header titles at 320 / 402 wide x 1.0 / 2.0 wrap whole, never ending in an ellipsis. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, screen } from '@testing-library/react-native';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { fontSize } from '@/theme/typography';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { MATRIX, expectFits, matrixName } from '@/test/textFitMatrix';
import { CompactHeader } from '../CompactHeader';
import { DetailHeader } from '../DetailHeader';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: { full_name: 'Paul', email: null } }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: jest.fn(() => ({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null })),
}));

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

function expectWholeTitle(text: string) {
  const title = screen.getByText(text);
  expect(title.props.numberOfLines).toBeUndefined();
  expect(title.props.ellipsizeMode).toBeUndefined();
  const s = flat(title);
  expect(s.height).toBeUndefined();
  // the title takes the row's spare width and wraps inside it
  expect(s.flex).toBe(1);
  expect(s.minWidth).toBe(0);
  return s;
}

beforeEach(resetShellStores);
afterEach(cleanup);

describe.each(MATRIX)('header titles at $width wide x $scale', (m) => {
  beforeEach(() => {
    mockWidth = m.width;
    mockScale = m.scale;
  });

  it.each(['How this was worked out', 'Check a purchase'])(`DetailHeader shows "%s" whole (${matrixName(m)})`, async (title) => {
    await renderWithShellProviders(
      <FontScaleProvider value={m.scale}>
        <DetailHeader title={title} />
      </FontScaleProvider>,
      { backHistory: { canGoBack: true } },
    );
    const s = expectWholeTitle(title);
    expect(s.fontSize).toBe(fontSize.sheetTitle * m.scale);
    expectFits();
  });

  it(`the pinned home header shows "Can I afford it" whole, on the capped tier (${matrixName(m)})`, async () => {
    await renderWithShellProviders(
      <FontScaleProvider value={m.scale}>
        <CompactHeader title="Can I afford it" visible showBack={false} />
      </FontScaleProvider>,
    );
    const s = expectWholeTitle('Can I afford it');
    // D-19 capped tier: at most 1.3x, so the pinned header stays a header plus at most a wrapped line
    expect(s.fontSize).toBeCloseTo(fontSize.heading * Math.min(m.scale, 1.3));
    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
    expectFits();
  });

  it(`the pinned Activity header (sheetTitle role) wraps too (${matrixName(m)})`, async () => {
    await renderWithShellProviders(
      <FontScaleProvider value={m.scale}>
        <CompactHeader title="Activity this month" titleRole="sheetTitle" visible showBack={false} />
      </FontScaleProvider>,
    );
    expectWholeTitle('Activity this month');
    expectFits();
  });
});
