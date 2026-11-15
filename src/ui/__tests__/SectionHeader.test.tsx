// 06.2-05 (D-24, D-06): the shared section header. 28 tall, title left, count or See all right, never an icon.
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors } from '@/theme/tokens';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { MATRIX, expectFits, expectTargets } from '@/test/textFitMatrix';
import { SectionHeader } from '../SectionHeader';

jest.setTimeout(30000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));
beforeEach(() => {
  mockWidth = 402;
});

const hidden = { includeHiddenElements: true };

function wrap(ui: React.ReactElement, scale = 1) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
}

describe('SectionHeader (D-24)', () => {
  it('renders the title as a header in a 28-tall row', async () => {
    await wrap(<SectionHeader title="Coming up" testID="sh" />);
    const title = screen.getByRole('header');
    expect(title).toHaveTextContent('Coming up');
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ color: colors.inkMuted });
    const row = StyleSheet.flatten(screen.getByTestId('sh').props.style);
    expect(row).toMatchObject({ minHeight: 28, justifyContent: 'space-between' });
    expect(row).not.toHaveProperty('height');
  });

  it('shows a count on the right', async () => {
    await wrap(<SectionHeader title="Bills" count={4} />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a See all link with a 44+ target and no icon', async () => {
    const onSeeAll = jest.fn();
    await wrap(<SectionHeader title="Bills" count={4} seeAllLabel="See all" onSeeAll={onSeeAll} />);
    const link = screen.getByRole('button', { name: 'See all' });
    expect(link.props.hitSlop).toEqual(LINK_HIT_SLOP);
    expectTargets('See all');
    expect(screen.queryByText('4')).toBeNull();
    fireEvent.press(link);
    expect(onSeeAll).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByTestId(/^glyph-/, hidden)).toHaveLength(0);
  });

  it('shows no link without a label', async () => {
    await wrap(<SectionHeader title="Bills" onSeeAll={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(MATRIX)('fits at %o', async (m) => {
    mockWidth = m.width;
    await wrap(<SectionHeader title="Recurring payments this month" seeAllLabel="See all" onSeeAll={() => undefined} />, m.scale);
    expectFits();
  });
});
