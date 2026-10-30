/** 05.3-50 F4: the sheet title row at 320 / 402 wide x 1.0 / 2.0. The title gives way and wraps; Cancel is always whole. */
import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { space } from '@/theme/layout';
import { MATRIX, expectFits, expectTargets, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import { SheetHeader } from '../SheetHeader';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

const TITLES = ['Your unspent money', 'Emergency fund', 'What changed?', 'New pot'];

afterEach(cleanup);

describe.each(MATRIX)('SheetHeader at $width wide x $scale', (m) => {
  beforeEach(() => {
    mockWidth = m.width;
    mockScale = m.scale;
  });

  it.each(TITLES)(`shows "%s" and Cancel whole (${matrixName(m)})`, async (title) => {
    const onCancel = jest.fn();
    await render(
      <ThemeProvider>
        <FontScaleProvider value={m.scale}>
          <SheetHeader title={title} cancelLabel="Cancel" onCancel={onCancel} />
        </FontScaleProvider>
      </ThemeProvider>,
    );
    const titleText = screen.getByText(title);
    expect(titleText.props.numberOfLines).toBeUndefined();
    expect(flat(titleText).flexShrink).toBe(1);

    const cancelText = screen.getByText('Cancel');
    expect(cancelText.props.numberOfLines).toBeUndefined();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    // Cancel never gives way to the title, so it is never clipped at the edge
    expect(flat(cancel).flexShrink).toBe(0);
    expect(flat(cancel).minHeight).toBe(space.touchMin);
    expectTargets('Cancel');
    expectFits();
    await fireEvent.press(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it(`with an info accessory the title group still gives way (${matrixName(m)})`, async () => {
    await render(
      <ThemeProvider>
        <FontScaleProvider value={m.scale}>
          <SheetHeader
            title="Your unspent money"
            cancelLabel="Cancel"
            onCancel={jest.fn()}
            titleAccessory={<RNText>{'i'}</RNText>}
          />
        </FontScaleProvider>
      </ThemeProvider>,
    );
    expect(flat(screen.getByText('Your unspent money')).flexShrink).toBe(1);
    expect(flat(screen.getByRole('button', { name: 'Cancel' })).flexShrink).toBe(0);
    expectFits();
  });
});
