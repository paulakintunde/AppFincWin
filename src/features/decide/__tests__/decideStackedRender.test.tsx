/**
 * D-76 R6 "Required layout checks" item 3: the stacked forms of Where it lands, the key figures and the segmented
 * controls render at text scale 2 and at 320 wide, and stay side by side at 402 and 1.0x.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { LedgersBody } from '../check/sections/LedgersSection';
import type { SectionProps } from '../check/sections/sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../check/steps/__tests__/helpers/stepProps';
import { loggedSource } from '../snapshot/__tests__/helpers/snapshotFixtures';
import { FigureStrip } from '../ui/FigureStrip';
import { SegmentedToggle } from '../ui/SegmentedToggle';

jest.setTimeout(30000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));
beforeEach(() => {
  mockWidth = 402;
});

function ledgerProps(): SectionProps {
  const p = stepProps(buy({ advertised: 150_000, method: 'cash' }), {}, loggedSource());
  return { computation: p.computation, inputs: p.inputs, update: jest.fn(), whole, exact, currency: 'USD', readOnly: false };
}

const ITEMS = [
  { caption: 'Left', value: '$1,234.56' },
  { caption: 'Runway', value: '14 months' },
];
const OPTIONS = [
  { key: 'a', label: 'Cash' },
  { key: 'b', label: 'Credit' },
];

/** The container holding both Now and After: Text > figure View > figures View. */
const figuresStyle = () => StyleSheet.flatten(screen.getAllByText('Now')[0]!.parent!.parent!.props.style);
const stripStyle = () => StyleSheet.flatten(screen.getByLabelText('Left, $1,234.56').props.style);
const radioDots = () => screen.queryAllByTestId('radio-dot', { includeHiddenElements: true });

async function renderAll(scale: number) {
  await wrap(
    <>
      <LedgersBody {...ledgerProps()} />
      <FigureStrip items={ITEMS} />
      <SegmentedToggle options={OPTIONS} value="a" onChange={() => undefined} accessibilityLabel="How you pay" />
    </>,
    scale,
  );
}

describe('D-76 stacked render guards', () => {
  it('D-76 Where it lands, key figures and segmented controls stack at fontScale 2', async () => {
    await renderAll(2);
    expect(figuresStyle()).not.toHaveProperty('flexDirection', 'row');
    expect(stripStyle()).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between' });
    expect(screen.getByLabelText('How you pay').props.accessibilityRole).toBe('radiogroup');
    expect(radioDots()).toHaveLength(2);
  });

  it('D-76 they stack at 320 wide', async () => {
    mockWidth = 320;
    await renderAll(1);
    expect(figuresStyle()).not.toHaveProperty('flexDirection', 'row');
    expect(stripStyle()).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between' });
    expect(radioDots()).toHaveLength(2);
  });

  it('D-76 they stay side by side at 402 and 1.0x', async () => {
    await renderAll(1);
    expect(figuresStyle()).toMatchObject({ flexDirection: 'row' });
    expect(stripStyle()).toMatchObject({ flex: 1 });
    expect(stripStyle()).not.toHaveProperty('justifyContent', 'space-between');
    expect(radioDots()).toHaveLength(0);
    expect(StyleSheet.flatten(screen.getByLabelText('Cash').props.style)).toMatchObject({ flex: 1 });
  });
});
