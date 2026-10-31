/**
 * Plan 05.3-41 (R6): the Answer screen at 320 / 402 wide x 1.0x / 2.0x. Jest has no layout engine, so each cell renders at that
 * width and text scale and asserts what the tree can show: the hero, strip, first fact and fixed bar are all present, the bar
 * pills stack under rule S, every target is 44 or more, and nothing is clamped or fixed in height.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, screen } from '@testing-library/react-native';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { copy } from './answerKit';
import { wrap } from './kit';
import { AnswerScreen } from '../AnswerScreen';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
// One stable value, as the real hook memoises its result.
jest.mock('@/data/queries/decideCheckV3', () => {
  const k = jest.requireActual('./answerKit');
  const value = { status: 'ready', row: k.rowOf(), evaluation: k.fullEv(), withoutRefunds: null, inputs: k.SCREEN_INPUTS };
  return { useCheckV3: () => value };
});
jest.mock('@/data/mutations/decideChecks', () => ({ useReopenCheck: () => ({ reopen: () => 'new-id' }) }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-20', homeCurrency: 'USD', timeZone: 'UTC' }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./answerKit').fakeFormat }));
jest.mock('../../ask/focusNode', () => ({ focusNode: jest.fn() }));
// 05.3-58: the real NotReadyCard renders here; its answer hook reads queries that need the Supabase env.
jest.mock('../../ready/useReadinessAnswer', () => ({ useReadinessAnswer: () => ({ answer: jest.fn(), clearWaiver: jest.fn() }) }));
jest.mock('../questionBodies', () => ({ renderQuestionBody: () => null }));
jest.mock('../../record/RecordSheet', () => ({ RecordSheet: () => null }));
jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    setAccessibilityFocus: jest.fn(),
    announceForAccessibility: jest.fn(),
    isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

describe.each(MATRIX)('Answer screen, $width wide at $scale x', (cell) => {
  beforeEach(() => {
    mockWidth = cell.width;
    mockScale = cell.scale;
  });
  afterEach(cleanup);

  it(`${matrixName(cell)}: the hero, strip, first fact and the fixed bar all render, with 44-high targets`, async () => {
    await wrap(<AnswerScreen id="c1" />, cell.scale);
    expect(screen.getByText(copy('decide.v3.verdict.fitsMonth.chip'), { hidden: true })).toBeTruthy();
    expect(screen.getByTestId('strip-bar', { hidden: true })).toBeTruthy();
    expect(screen.getAllByLabelText(/remaining after/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Record as bought')).toBeTruthy();
    expectFits({ clampCount: 3 });
    expectTargets('Back to the check', 'Sofa · $1,200. Change details', 'Record as bought', 'Save the plan', 'Not buying it', 'Check another price', 'See how this was worked out');
  });

  it(`${matrixName(cell)}: the bar pills stack under rule S`, async () => {
    await wrap(<AnswerScreen id="c1" />, cell.scale);
    const pill = screen.getByLabelText('Record as bought');
    const group = StyleSheet.flatten(pill.parent?.props.style);
    const stacked = cell.width < 360 || cell.scale > 1.3;
    expect(group.flexDirection === 'row').toBe(!stacked);
  });
});
