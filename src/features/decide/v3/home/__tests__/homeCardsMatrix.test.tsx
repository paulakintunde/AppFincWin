/** 05.3-23: the home cards at 320 / 402 wide x 1.0x / 2.0x (R18 matrix). */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, screen } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
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

const flat = (n: ReactTestInstance): Record<string, unknown> => {
  const s = n.props.style;
  return (StyleSheet.flatten(typeof s === 'function' ? s({ pressed: false }) : s) ?? {}) as Record<string, unknown>;
};

function texts(n: ReactTestInstance, out: ReactTestInstance[] = []): ReactTestInstance[] {
  if (n.type === 'Text') out.push(n);
  for (const c of n.children) if (typeof c !== 'string') texts(c, out);
  return out;
}

/** D-26: three full-width rows, one under the other: text block flex 1, chevron last, no clamp or shrink, 44 dp floor. */
function expectFigureRows(): void {
  const ids = ['figure-row-typical', 'figure-row-unspent', 'figure-row-emergency'];
  const rows = ids.map((id) => screen.getByTestId(id));
  const parent = rows[0]!.parent;
  for (const row of rows) {
    const s = flat(row);
    expect(s.flexDirection).toBe('row');
    expect(Number(s.minHeight)).toBeGreaterThanOrEqual(44);
    expect(s.flex ?? 0).not.toBe(1);
    const hostKids = row.children.filter((c): c is ReactTestInstance => typeof c !== 'string');
    const last = hostKids[hostKids.length - 1]!;
    expect(last.props.testID).toBe('figure-row-chevron');
    const body = hostKids[0]!;
    expect(body.props.testID).toBe('figure-row-text');
    expect(flat(body).flex).toBe(1);
    for (const t of texts(row)) {
      expect(t.props.numberOfLines).toBeUndefined();
      expect(t.props.adjustsFontSizeToFit).toBeUndefined();
    }
  }
  // the rows stack in one column-direction container, never side by side
  const container = flat(parent!);
  expect(container.flexDirection ?? 'column').toBe('column');
}

describe.each(MATRIX)('home cards at $width wide x $scale', (m) => {
  const cell = () => {
    mockWidth = m.width;
    mockScale = m.scale;
  };

  it(`MonthBarCard fits (${matrixName(m)})`, async () => {
    cell();
    await wrap(<MonthBarCard evaluation={samEvaluation()} />, m.scale);
    // 05.3-60 (D-26): only the month figure scales to fit; the three figure rows never clamp
    expectFits({ clampCount: 1 });
    expectTargets(/^Typical month/, /^Unspent money/, /^Emergency fund/);
    expect(screen.getByTestId('month-figure').props.numberOfLines).toBe(1);
    expectFigureRows();
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
