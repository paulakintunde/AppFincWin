import React from 'react';
import * as RN from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { shouldStack } from '../textFit';
import { LabelValueRow } from '../LabelValueRow';

jest.setTimeout(30000);

let mockWidth = 402;
beforeEach(() => {
  mockWidth = 402;
  jest.spyOn(RN, 'useWindowDimensions').mockImplementation(() => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

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
