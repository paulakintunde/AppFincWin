/** 05.3-31: Help me check this at 320 / 402 wide x 1.0x / 2.0x (R18 matrix). */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { MATRIX, expectFits, expectTargets, matrixName } from '../../../__tests__/helpers/r18Fit';
import { HelpScreen } from '../HelpScreen';
import { roughInputs } from './helpKit';
import { returnToTab } from '@/shell/navigation/returnToTab';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('expo-router', () => ({ useRootNavigationState: () => undefined, router: { back: jest.fn(), navigate: jest.fn() } }));
jest.mock('@/shell/navigation/returnToTab', () => ({ returnToTab: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => ({ DetailScreen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null }) }));
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: jest.fn() }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', homeCurrency: 'USD' }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));

afterEach(cleanup);

describe.each(MATRIX)('Help screen at $width wide x $scale', (m) => {
  it(`fits and keeps the fixed bar (${matrixName(m)})`, async () => {
    mockWidth = m.width;
    mockScale = m.scale;
    await wrap(<HelpScreen id="x" inputs={roughInputs()} />, m.scale);
    expectFits();
    expectTargets('Check with these figures', 'Update my records instead');
    expect(screen.getByText('Check with these figures')).toBeTruthy();
    expect(screen.getByText('Update my records instead')).toBeTruthy();
  });
});
