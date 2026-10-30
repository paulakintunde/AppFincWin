/** 05.3-23: the home cards at 320 / 402 wide x 1.0x / 2.0x (R18 matrix). */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { MATRIX, expectFits, expectTargets, matrixName } from '../../../__tests__/helpers/r18Fit';
import { CheckCard } from '../CheckCard';
import { EnvelopeGrid } from '../EnvelopeGrid';
import { MonthBarCard } from '../MonthBarCard';
import { samEvaluation } from './homeCardsTestKit';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./homeCardsTestKit').fakeFormat }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../../setup/UnspentSheet', () => ({ UnspentSheet: () => null }));
jest.mock('../../../setup/EmergencyFundSheet', () => ({ EmergencyFundSheet: () => null }));
jest.mock('../../../pots/PotSheet', () => ({ PotSheet: () => null }));

const envelopes = Array.from({ length: 6 }, (_, i) => ({
  id: `e${i}`,
  name: i === 0 ? 'Holiday to the lake house with the very long name that must wrap' : `Envelope ${i}`,
  amount: 123456789 * (i + 1),
}));

afterEach(cleanup);

describe.each(MATRIX)('home cards at $width wide x $scale', (m) => {
  const cell = () => {
    mockWidth = m.width;
    mockScale = m.scale;
  };

  it(`MonthBarCard fits (${matrixName(m)})`, async () => {
    cell();
    await wrap(<MonthBarCard evaluation={samEvaluation()} />, m.scale);
    expectFits({ clampCount: 4 });
    expectTargets(/^Typical month/, /^Unspent money/, /^Emergency fund/);
    expect(screen.getByTestId('month-figure').props.numberOfLines).toBe(1);
  });

  it(`CheckCard fits (${matrixName(m)})`, async () => {
    cell();
    await wrap(<CheckCard />, m.scale);
    expectFits();
    expectTargets('Check a purchase');
  });

  it(`EnvelopeGrid fits (${matrixName(m)})`, async () => {
    cell();
    await wrap(<EnvelopeGrid envelopes={envelopes} />, m.scale);
    expectFits({ clampCount: 4 });
    expectTargets('All envelopes (6)');
    expect(screen.getByText('All envelopes (6)')).toBeTruthy();
  });
});
