import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { renderWithShellProviders } from '@/shell/__tests__/testUtils';
import { TabHeader, TITLE_MIN_FONT_SCALE, titleWordCount } from '../TabHeader';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: null }) }));

function renderAt(scale: number) {
  return renderWithShellProviders(
    <FontScaleProvider value={scale}>
      <TabHeader title="Overview" eyebrow="MONDAY" />
    </FontScaleProvider>,
  );
}

describe('TabHeader font scale (D-19)', () => {
  it('caps the title at 2x and scales the eyebrow with it', async () => {
    await renderAt(3);
    expect(StyleSheet.flatten(screen.getByText('Overview').props.style).fontSize).toBe(52);
    expect(StyleSheet.flatten(screen.getByText('MONDAY', { includeHiddenElements: true }).props.style).fontSize).toBe(23);
  });

  it('scales proportionally below the cap', async () => {
    await renderAt(1.5);
    expect(StyleSheet.flatten(screen.getByText('Overview').props.style).fontSize).toBe(39);
  });

  it('wraps between words but never inside one: one line per word, shrinking a too-wide word to fit', async () => {
    await renderAt(2);
    const title = screen.getByText('Overview');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.adjustsFontSizeToFit).toBe(true);
    expect(title.props.minimumFontScale).toBe(TITLE_MIN_FONT_SCALE);
  });

  it('gives a multi-word title one line per word so it can still wrap', () => {
    expect(titleWordCount('Can I afford it?')).toBe(4);
    expect(titleWordCount('  Overview ')).toBe(1);
    expect(titleWordCount('')).toBe(1);
  });
});

// 05.5 device fix (Pixel 6): at a large font scale, screen-owned controls sit on their own row so the title keeps the full width.
describe('TabHeader controls at large text', () => {
  function renderWithTrailing(scale: number) {
    return renderWithShellProviders(
      <FontScaleProvider value={scale}>
        <TabHeader title="Can I afford it?" trailing={<React.Fragment />} />
      </FontScaleProvider>,
    );
  }

  it('keeps title and controls on one row at normal size', async () => {
    await renderWithTrailing(1);
    expect(StyleSheet.flatten(screen.getByTestId('tab-header').props.style).flexDirection).toBe('row');
  });

  it('stacks the controls above the title from 1.3x', async () => {
    await renderWithTrailing(1.3);
    expect(StyleSheet.flatten(screen.getByTestId('tab-header').props.style).flexDirection).toBe('column');
  });

  it('a header without screen-owned controls never stacks', async () => {
    await renderAt(2);
    expect(StyleSheet.flatten(screen.getByTestId('tab-header').props.style).flexDirection).toBe('row');
  });
});

describe('TabHeader stacks when the title wraps beside the controls', () => {
  it('stacks after a two-line title layout, below the 1.3x threshold', async () => {
    await renderWithShellProviders(
      <FontScaleProvider value={1.15}>
        <TabHeader title="Can I afford it?" trailing={<React.Fragment />} />
      </FontScaleProvider>,
    );
    expect(StyleSheet.flatten(screen.getByTestId('tab-header').props.style).flexDirection).toBe('row');
    await act(async () => {
      fireEvent(screen.getByText('Can I afford it?'), 'textLayout', { nativeEvent: { lines: [{}, {}] } });
    });
    expect(StyleSheet.flatten(screen.getByTestId('tab-header').props.style).flexDirection).toBe('column');
    await act(async () => {
      fireEvent(screen.getByText('Can I afford it?'), 'textLayout', { nativeEvent: { lines: [{}] } });
    });
    expect(StyleSheet.flatten(screen.getByTestId('tab-header').props.style).flexDirection).toBe('column');
  });
});
