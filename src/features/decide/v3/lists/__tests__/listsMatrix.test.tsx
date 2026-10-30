/** 05.3-36: the saved-plan and past-decision rows at 320 / 402 wide x 1.0x / 2.0x (R18 matrix). */
import React from 'react';
import { cleanup } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { MATRIX, expectFits, expectTargets, matrixName } from '../../../__tests__/helpers/r18Fit';
import { DecisionsScreen } from '../DecisionsScreen';
import { SavedPlanRow } from '../SavedPlanRow';
import { LONG, checkRow, liveEval } from './listsTestKit';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/data/queries/decideCheckV3', () => ({
  useChecksV3: () => {
    const kit = jest.requireActual('./listsTestKit');
    return {
      status: 'ready',
      rows: [kit.checkRow({ id: 'b1', name: kit.LONG, status: 'bought' }), kit.checkRow({ id: 'p1', name: `${kit.LONG} again`, status: 'passed' })],
      byId: new Map([
        ['b1', kit.liveEval('fits_month', null, null, 123456789012)],
        ['p1', kit.liveEval('fits_month', null, null, 123456789012)],
      ]),
      withoutRefunds: new Map(),
    };
  },
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./listsTestKit').fakeFormat }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/mutations/decideChecks', () => ({ useAbandonCheck: () => ({ abandon: jest.fn() }) }));
jest.mock('../useRowActions', () => ({
  useDeleteRow: () => ({ remove: jest.fn(), confirmCopy: () => ({ title: 't', body: 'b' }) }),
  useCheckAgain: () => jest.fn(),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideLinks: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u', householdId: 'h' }) }));
jest.mock('@/shell/screen/DetailScreen', () => ({ DetailScreen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

afterEach(cleanup);

describe.each(MATRIX)('lists at $width wide x $scale', (m) => {
  const cell = () => {
    mockWidth = m.width;
    mockScale = m.scale;
  };

  it(`SavedPlanRow fits (${matrixName(m)})`, async () => {
    cell();
    await wrap(
      <SavedPlanRow row={checkRow({ name: LONG })} live={liveEval('not_yet', 'not_covered', null, 123456789012)} without={liveEval('fits_month', null)} />,
      m.scale,
    );
    // the shared swipe row adds one clamped label of its own (D-23: rows are now deletable)
    expectFits({ clampCount: 2, clamped: [/^Delete$/] });
    // the labelled swipe body takes its height from the row; the row's own named control is the ⋯ trigger
    expectTargets(/^More for A very long item name/);
  });

  it(`DecisionsScreen rows fit (${matrixName(m)})`, async () => {
    cell();
    await wrap(<DecisionsScreen />, m.scale);
    expectFits({ clampCount: 3, clamped: [/^Delete$/] });
    expectTargets(/^More for .*lines$/, /^More for .*again$/);
  });
});
