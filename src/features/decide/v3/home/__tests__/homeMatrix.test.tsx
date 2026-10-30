/** 05.3-39: the whole v3 home at 320 / 402 wide x 1.0x / 2.0x (R18 matrix) and its above-the-fold order. */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { MATRIX, expectFits, expectTargets, matrixName } from '../../../__tests__/helpers/r18Fit';
import { checkRow, liveEval, LONG } from '../../lists/__tests__/listsTestKit';
import { HomeScreen } from '../HomeScreen';
import { homeState, resetHome } from './homeScreenKit';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/data/queries/decideCheckV3', () => ({ useChecksV3: () => jest.requireActual('./homeScreenKit').useChecksV3Double() }));
jest.mock('../../../pots/usePots', () => ({ usePotsRead: () => jest.requireActual('./homeScreenKit').usePotsReadDouble() }));
jest.mock('../../../setup/useSetupFacts', () => ({ useSetupFacts: () => ({ fake: true }) }));
jest.mock('../../../setup/useUnspent', () => ({ useUnspent: () => ({ view: null }) }));
jest.mock('../../../setup/setupFlow', () => ({
  setupStatus: () => 'done',
  remainingNeeded: () => [],
  firstUnansweredNeeded: () => null,
  isNeeded: () => true,
}));
jest.mock('../../../settings/useSettingsData', () => ({ useSettingsData: () => null }));
jest.mock('@/shell/screen/TabRootScreen', () => ({ TabRootScreen: (p: object) => jest.requireActual('./homeScreenKit').TabRootDouble(p) }));
jest.mock('@/shell/header/AvatarButton', () => ({ AvatarButton: () => null }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useAbandonCheck: () => ({ abandon: jest.fn() }),
  useSaveCheckAnswer: () => ({ save: jest.fn() }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./homeScreenKit').fakeFormat }));
jest.mock('../../../setup/UnspentSheet', () => ({ UnspentSheet: () => null }));
jest.mock('../../../setup/EmergencyFundSheet', () => ({ EmergencyFundSheet: () => null }));
jest.mock('../../../pots/PotSheet', () => ({ PotSheet: () => null }));
jest.mock('../../refine/RefineCard', () => ({ RefineCard: () => null }));
// 05.3-49: the saved-row delete actions pull in the env config; the matrix only measures layout.
jest.mock('../../lists/useRowActions', () => ({ useDeleteRow: () => ({ remove: jest.fn(), confirmCopy: () => ({ title: 'Delete?', body: '' }) }), useCheckAgain: () => jest.fn() }));

afterEach(cleanup);

describe.each(MATRIX)('home at $width wide x $scale', (m) => {
  it(`fits (${matrixName(m)})`, async () => {
    mockWidth = m.width;
    mockScale = m.scale;
    resetHome();
    homeState.rows = [checkRow({ id: 'sofa', name: LONG, status: 'waiting' }), checkRow({ id: 'b', status: 'bought' })];
    homeState.byId = new Map([['sofa', liveEval('not_yet', 'not_covered', { kind: 'month', month: '2027-02' }, 123456789012)]]);
    homeState.pots = [{ id: 'e1', name: LONG, saved: 123456789 }];
    await wrap(<HomeScreen />, m.scale);
    // 05.3-49: the saved row's swipe body adds one clamped "Delete" label.
    expectFits({ clampCount: 7, clamped: [/^Delete$/] });
    expectTargets(/^Typical month/, /^Unspent money/, /^Emergency fund/, /^Check a purchase/, /^Something changed\?/, /^Past decisions/, /^Decide settings/);
  });
});

describe('home order at 402 x 1.0', () => {
  it('the month card and the check card are the first two blocks after the header', async () => {
    mockWidth = 402;
    mockScale = 1;
    resetHome();
    await wrap(<HomeScreen />);
    const tree = JSON.stringify(screen.toJSON());
    const month = tree.indexOf('Typical month');
    const check = tree.indexOf('Thinking of buying something?');
    const envelopes = tree.indexOf('Envelopes');
    expect(month).toBeGreaterThan(-1);
    expect(month).toBeLessThan(check);
    expect(check).toBeLessThan(envelopes);
  });
});
