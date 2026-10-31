/** 05.3-30: the six-month bars and the worked screen at 320 / 402 wide x 1.0x / 2.0x (R18 matrix). */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { minorUnits } from '@/engine/money';
import { barHeights, SixMonthBars } from '../SixMonthBars';
import { WorkedBody } from '../WorkedScreen';
import { NAME_MAP, samEvaluation, samInputs } from './workedKit';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./workedKit').fakeFormat }));
jest.mock('@/data/queries/decide', () => ({ useDecideSnapshot: () => ({ result: null }) }));
jest.mock('@/data/queries/decideCheckV3', () => ({ useChecksV3: jest.fn() }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ householdId: 'h' }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View: V } = jest.requireActual('react-native');
  return { DetailScreen: ({ children }: { children: React.ReactNode }) => <V>{children}</V> };
});

afterEach(cleanup);

const mu = minorUnits;
const state = (s: 'normal' | 'half' | 'out') => s;
const six = [
  { month: '2026-04', left: mu(50000), state: state('normal') },
  { month: '2026-05', left: mu(40000), state: state('normal') },
  { month: '2026-06', left: mu(-10000), state: state('normal') },
  { month: '2026-07', left: mu(45000), state: state('normal') },
  { month: '2026-08', left: mu(5000), state: state('half') },
  { month: '2026-09', left: mu(70000), state: state('out') },
];

describe('barHeights', () => {
  it('is integer, proportional to |left|, capped at 120', () => {
    expect(barHeights([50000, -25000, 0, 100000])).toEqual([60, 30, 0, 120]);
    expect(barHeights([0, 0])).toEqual([0, 0]);
    expect(barHeights([1, 100000])).toEqual([2, 120]);
  });
});

describe('SixMonthBars', () => {
  it('six entries draw six bars; the group label reads every month with its state', async () => {
    await wrap(<SixMonthBars six={six} typical={mu(36000)} largest={null} />);
    expect(screen.getAllByTestId(/^bar-/, { includeHiddenElements: true })).toHaveLength(6);
    expect(screen.getByLabelText(/April: \$500, normal\. May: \$400, normal\. June: −\$100, normal/)).toBeTruthy();
    expect(screen.getByLabelText(/August: \$50, half-logged\. September: \$700, left out/)).toBeTruthy();
    expect(screen.getByText('Typical month: the middle of these, $360.')).toBeTruthy();
    expect(screen.getByText('August is half-logged, so it’s left out.')).toBeTruthy();
    expect(screen.queryByText(/Based on/)).toBeNull();
  });

  it('four entries draw four bars and say how many months', async () => {
    await wrap(<SixMonthBars six={six.slice(0, 4)} typical={null} largest={null} />);
    expect(screen.getAllByTestId(/^bar-/, { includeHiddenElements: true })).toHaveLength(4);
    expect(screen.getByText('Based on 4 months.')).toBeTruthy();
  });
});

describe.each(MATRIX)('worked screen at $width wide x $scale', (m) => {
  it(`fits (${matrixName(m)})`, async () => {
    mockWidth = m.width;
    mockScale = m.scale;
    await wrap(<WorkedBody evaluation={samEvaluation()} inputs={samInputs()} names={NAME_MAP} />, m.scale);
    expectFits({ clampCount: 12 });
    const bars = screen.queryAllByTestId(/^bar-/, { includeHiddenElements: true }).length;
    if (m.scale >= 2) {
      // a plain list of lines, no drawing
      expect(bars).toBe(0);
      expect(screen.getByText('April: $500, normal')).toBeTruthy();
    } else {
      expect(bars).toBe(6);
      const rowKeys = new Set(screen.getAllByTestId(/^six-/, { includeHiddenElements: true }).map((n) => n.parent));
      // six columns on one row at 402, three over two rows at 320
      expect(rowKeys.size).toBe(m.width < 360 ? 2 : 1);
    }
  });
});
