// 05.4-39 (D-156): FigureStrip's text-fit tests, split from textFit.test.tsx when textFit moved to src/ui (FigureStrip stays in Decide).
import React from 'react';
import * as RN from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
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
