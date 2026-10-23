import React from 'react';
import * as RN from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { shouldStack } from '../textFit';
import { LabelValueRow } from '../LabelValueRow';
import { SegmentedToggle } from '../SegmentedToggle';
import { FigureStrip } from '../FigureStrip';

jest.setTimeout(30000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));
beforeEach(() => {
  mockWidth = 402;
});

function wrap(ui: React.ReactElement, scale = 1) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
}

describe('shouldStack', () => {
  it('D-76 rule S: stacks below 360, above 1.3x or past 16 characters', () => {
    expect(shouldStack({ width: 359, fontScale: 1 })).toBe(true);
    expect(shouldStack({ width: 402, fontScale: 1.31 })).toBe(true);
    expect(shouldStack({ width: 402, fontScale: 1, valueLength: 17 })).toBe(true);
  });
  it('D-76 rule S: the boundaries do not stack', () => {
    expect(shouldStack({ width: 360, fontScale: 1.3, valueLength: 16 })).toBe(false);
    expect(shouldStack({ width: 402, fontScale: 1 })).toBe(false);
  });
});

describe('LabelValueRow', () => {
  it('sits side by side at 402 and 1.0x', async () => {
    await wrap(<LabelValueRow label="Rent" value="$1,200" />);
    const row = screen.getByLabelText('Rent, $1,200');
    expect(RN.StyleSheet.flatten(row.props.style)).not.toHaveProperty('height');
    expect(screen.getByText('$1,200')).toHaveStyle({ textAlign: 'right' });
  });
  it('LabelValueRow stacks label over value at fontScale 2', async () => {
    await wrap(<LabelValueRow label="Rent" sub="monthly" value="$1,200" />, 2);
    expect(screen.getByLabelText('Rent, $1,200, monthly')).toBeTruthy();
    expect(screen.getByText('$1,200')).toHaveStyle({ textAlign: 'left' });
  });
  it('uses a given a11yLabel', async () => {
    await wrap(<LabelValueRow label="Rent" value="$1,200" a11yLabel="Rent is 1200" />);
    expect(screen.getByLabelText('Rent is 1200')).toBeTruthy();
  });
});

describe('SegmentedToggle', () => {
  const options = [
    { key: 'a', label: 'Buy now' },
    { key: 'b', label: 'Wait a month' },
  ];
  it('keeps equal segments at 402 and 1.0x', async () => {
    await wrap(<SegmentedToggle options={options} value="a" onChange={() => undefined} accessibilityLabel="When" />);
    expect(screen.queryByTestId('radio-dot', { includeHiddenElements: true })).toBeNull();
    const seg = RN.StyleSheet.flatten(screen.getByLabelText('Buy now').props.style);
    expect(seg).toMatchObject({ flex: 1, minHeight: 44 });
    expect(seg).not.toHaveProperty('height');
  });
  it('D-76 Seg: the segmented control becomes a radio list at fontScale 2', async () => {
    const onChange = jest.fn();
    await wrap(<SegmentedToggle options={options} value="a" onChange={onChange} accessibilityLabel="When" />, 2);
    expect(screen.getByLabelText('When').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByTestId('radio-dot', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByLabelText('Buy now').props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(screen.getByLabelText('Wait a month'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('SegmentedToggle label length', () => {
  it('D-76 Seg: a label past 16 characters stacks the segments at 402 and 1.0x', async () => {
    const long = [
      { key: 'worst', label: 'Worst · US$4,000.00' },
      { key: 'avg', label: 'Average · US$7,156.66' },
    ];
    await wrap(<SegmentedToggle options={long} value="avg" onChange={() => undefined} accessibilityLabel="Judge on" />);
    expect(screen.getAllByTestId('radio-dot', { includeHiddenElements: true })).toHaveLength(2);
  });
});

describe('FigureStrip', () => {
  const items = [
    { caption: 'Left', value: '$1,234.56' },
    { caption: 'Status', value: 'Fits easily', kind: 'words' as const },
  ];
  it('D-76 rule N: a figure fits one line and words wrap', async () => {
    await wrap(<FigureStrip items={items} />);
    const figure = screen.getByText('$1,234.56');
    expect(figure.props.numberOfLines).toBe(1);
    expect(figure.props.adjustsFontSizeToFit).toBe(true);
    expect(figure.props.minimumFontScale).toBe(0.8);
    const words = screen.getByText('Fits easily');
    expect(words.props.numberOfLines).toBeUndefined();
    expect(words.props.adjustsFontSizeToFit).toBeUndefined();
  });
  it('keeps side-by-side cells at 402 and 1.0x', async () => {
    await wrap(<FigureStrip items={items} />);
    expect(RN.StyleSheet.flatten(screen.getByLabelText('Left, $1,234.56').props.style)).toMatchObject({ flex: 1 });
  });
  it('D-76 rule S: the figure strip stacks below 360 wide', async () => {
    mockWidth = 320;
    await wrap(<FigureStrip items={items} />);
    const narrow = RN.StyleSheet.flatten(screen.getByLabelText('Left, $1,234.56').props.style);
    expect(narrow).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between' });
  });
});
