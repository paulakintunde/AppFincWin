/**
 * Plan 05.3-38 (R6): the lower half of the answer at 320 / 402 wide x 1.0x / 2.0x. Jest has no layout engine, so each cell
 * renders at that width and text scale and asserts what the tree can show: no fixed text height, no clamp on system text,
 * no negative margin, targets of 44 or more, whole labels, the pills stacked under rule S, and the bar still present at 2.0x.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, screen } from '@testing-library/react-native';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { factRows } from '@/features/decide/v3/model/factRows';
import { wrap } from '@/features/decide/v3/answer/__tests__/kit';
import { AnswerActionBar } from '../AnswerActionBar';
import { AnswerLinks } from '../AnswerLinks';
import { FactRows } from '../FactRows';
import { NeedsInputCard } from '../NeedsInputCard';
import { RefundHintTile } from '../RefundHintTile';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/data/mutations/decideChecks', () => ({ useReopenCheck: () => ({ reopen: () => 'new-id' }) }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => {
  const money = (n: number): string => '$' + (n / 100).toLocaleString('en-US');
  return {
    useV3Format: () => ({
      money,
      moneyA11y: money,
      month: () => 'October',
      monthYear: () => 'October 2026',
      date: (iso: string) => iso,
      params: () => ({ screen: { date: '28 Oct' }, a11y: {} }),
      flat: (p: Record<string, string | number>) => ({ screen: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])), a11y: {} }),
    }),
  };
});

const row = { id: 'orig-1', household_id: 'h', created_by: 'u', kind: 'buy', name: 'Sofa', inputs: {} } as never;
const facts = factRows({
  code: 'fits_unspent',
  readyBy: null,
  facts: [
    { code: 'month_left_after', values: { month: '2026-10', left: 42500 } },
    { code: 'unspent_before_after', values: { before: 240000, after: 162500 } },
    { code: 'emergency_untouched', values: { amount: 900000 } },
    { code: 'implied_rate', values: { rate: '9999' } },
  ],
} as never);
const lines = ['decide.v3.ui.answer.missingHeading'];

describe.each(MATRIX)('answer lower half, $width wide at $scale x', (cell) => {
  beforeEach(() => {
    mockWidth = cell.width;
    mockScale = cell.scale;
  });
  afterEach(cleanup);

  it(`${matrixName(cell)}: facts, links, refund tile and needs input fit`, async () => {
    await wrap(
      <>
        <FactRows rows={facts} />
        <AnswerLinks checkId="c1" code="fits_month" band={6} wholePlanTotal={123400} />
        <RefundHintTile show row={row} />
        <NeedsInputCard lines={lines} helpOffered checkId="c1" />
      </>,
      cell.scale,
    );
    expectFits({ clampCount: 3 });
    expectTargets('What could I do instead?', 'See how this was worked out', 'Help me check this');
  });

  it(`${matrixName(cell)}: the action bar stays, its targets are 44 or more and the pills stack when narrow or large`, async () => {
    await wrap(
      <AnswerActionBar result={{ code: 'fits_month', variant: null, readyBy: null } as never} row={row} onBought={jest.fn()} onPlan={jest.fn()} onNotBuying={jest.fn()} />,
      cell.scale,
    );
    expectFits();
    expectTargets('Record as bought', 'Save the plan', 'Not buying it', 'Check another price');
    const pill = screen.getByLabelText('Record as bought');
    const group = StyleSheet.flatten(pill.parent?.props.style);
    const stacked = cell.width < 360 || cell.scale > 1.3;
    expect(group.flexDirection === 'row').toBe(!stacked);
    expect(StyleSheet.flatten(pill.props.style).minHeight).toBe(48);
  });
});
