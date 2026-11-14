/**
 * 06.2-07: the shared Row (D-09: two heights, slots, a real arrow) and EmptyState (D-24: 48 tile + heading + one
 * sentence + one button). Old props keep working; the fit checks run at every MATRIX point.
 */
import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors } from '@/theme/tokens';
import { ACCENTS, DEFAULT_ACCENT } from '@/theme/accents';
import { rowHeight, tile } from '@/theme/layout';
import { MATRIX, expectFits, matrixName } from '@/test/textFitMatrix';
import { IconTile } from '../icons/IconTile';
import { Row } from '../Row';
import { EmptyState, accentTintOver } from '../EmptyState';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
beforeEach(() => {
  mockWidth = 402;
  mockScale = 1;
});

const hidden = { includeHiddenElements: true };
const setup = (ui: React.ReactElement, scale = 1) =>
  render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
const flat = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as never) ?? {}) as Record<string, unknown>;

describe('Row (06.2 D-09)', () => {
  it('is 52 tall with one line', async () => {
    await setup(<Row label="Groceries" />);
    expect(flat(screen.getByTestId('row-root')).minHeight).toBe(rowHeight.one);
  });

  it('is 64 tall with a second line', async () => {
    await setup(<Row label="Groceries" sublabel="12 this month" />);
    expect(flat(screen.getByTestId('row-root')).minHeight).toBe(rowHeight.two);
  });

  it('a dense row keeps the one-line height, even with a second line', async () => {
    await setup(<Row label="1 Mar" sublabel="Transfer" value="$40" dense />);
    expect(flat(screen.getByTestId('row-root')).minHeight).toBe(52);
  });

  it('a pressable row clears 44 (iPhone) and 48 (Android)', async () => {
    await setup(<Row label="Groceries" onPress={jest.fn()} />);
    const h = Number(flat(screen.getByRole('button')).minHeight);
    expect(h).toBeGreaterThanOrEqual(48);
    expect(h).toBeGreaterThanOrEqual(44);
  });

  it('chevron draws the arrowRight glyph at 16 in inkFaint', async () => {
    await setup(<Row label="Groceries" chevron onPress={jest.fn()} />);
    const svg = screen.getByTestId('glyph-arrowRight', hidden);
    expect(svg.props.width).toBe(16);
    expect(svg.props.height).toBe(16);
    expect(JSON.stringify(screen.toJSON())).toContain(String(parseInt(`FF${colors.inkFaint.slice(1)}`, 16)));
  });

  it('without chevron there is no arrow', async () => {
    await setup(<Row label="Groceries" />);
    expect(screen.queryByTestId('glyph-arrowRight', hidden)).toBeNull();
  });

  it('amount is right-aligned, tabular, bodyStrong, ink by default', async () => {
    await setup(<Row label="Rent" amount="$1,200.00" />);
    const s = flat(screen.getByTestId('row-amount'));
    expect(s.textAlign).toBe('right');
    expect(s.fontVariant).toEqual(['tabular-nums']);
    expect(s.color).toBe(colors.ink);
  });

  it('amountTone positive is the accent and danger is the danger colour', async () => {
    const r = await setup(<Row label="Salary" amount="+$2,000.00" amountTone="positive" />);
    expect(flat(screen.getByTestId('row-amount')).color).not.toBe(colors.ink);
    expect(flat(screen.getByTestId('row-amount')).color).not.toBe(colors.danger);
    await r.unmount();
    await setup(<Row label="Card" amount="$300.00" amountTone="danger" />);
    expect(flat(screen.getByTestId('row-amount')).color).toBe(colors.danger);
  });

  it('lays out leading, text, amount, status, arrow in that order', async () => {
    await setup(
      <Row
        label="Groceries"
        leading={<IconTile icon="groceries" color={colors.ink} tint={colors.fill1} testID="tile" />}
        amount="$42.00"
        status={<RNText testID="badge">Over</RNText>}
        chevron
        onPress={jest.fn()}
      />,
    );
    const json = JSON.stringify(screen.toJSON());
    const order = ['row-leading', '["Groceries"]', 'row-amount', 'row-status', 'glyph-arrowRight'].map((k) => json.indexOf(k));
    order.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('wraps an IconTile in a 36 box and leaves other leading nodes alone', async () => {
    const r = await setup(<Row label="Groceries" leading={<IconTile icon="groceries" color={colors.ink} tint={colors.fill1} />} />);
    expect(flat(screen.getByTestId('row-leading'))).toMatchObject({ width: tile.row, height: tile.row });
    await r.unmount();
    await setup(<Row label="Groceries" leading={<RNText>A</RNText>} />);
    expect(flat(screen.getByTestId('row-leading')).width).toBeUndefined();
  });

  it('a pressable row speaks title, second line, amount and status word as one sentence', async () => {
    await setup(<Row label="Card" sublabel="Due 3 Mar" amount="$300.00" status={<RNText>Due</RNText>} statusText="Due soon" onPress={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Card, Due 3 Mar, $300.00, Due soon');
  });

  it('keeps the old label, value and press behaviour', async () => {
    const onPress = jest.fn();
    await setup(<Row label="Category" value="Groceries" onPress={onPress} />);
    const b = screen.getByRole('button');
    expect(b.props.accessibilityLabel).toBe('Category');
    expect(b.props.accessibilityValue).toMatchObject({ text: 'Groceries' });
    fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  for (const m of MATRIX) {
    it(`fits with a long title, a second line and an amount at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await setup(
        <Row
          label="Weekly groceries from the big shop across town"
          sublabel="Joint current account, 14 lines this month"
          amount="$1,234,567.89"
          leading={<IconTile icon="groceries" color={colors.ink} tint={colors.fill1} />}
          chevron
          onPress={jest.fn()}
        />,
        m.scale,
      );
      expectFits();
    });
  }
});

describe('EmptyState (06.2 D-24)', () => {
  it('without icon or action keeps the old heading + body form', async () => {
    await setup(<EmptyState heading="Nothing yet." body="Add the first one with the + button." />);
    expect(screen.getByText('Nothing yet.')).toBeTruthy();
    expect(screen.getByText('Add the first one with the + button.')).toBeTruthy();
    expect(screen.queryByTestId('empty-state-tile', hidden)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the heading is a header', async () => {
    await setup(<EmptyState heading="Nothing yet." body="Add the first one." />);
    expect(screen.getByRole('header')).toBeTruthy();
  });

  it('with an icon draws a 48 tile with a 24 glyph in the accent over the accent tint', async () => {
    await setup(<EmptyState heading="No accounts" body="Add one to start." icon="accounts" />);
    const t = screen.getByTestId('empty-state-tile', hidden);
    expect(flat(t)).toMatchObject({ width: 48, height: 48 });
    expect(screen.getByTestId('glyph-accounts', hidden).props.width).toBe(24);
    expect(flat(t).backgroundColor).toBe(accentTintOver(colors.fill1, ACCENTS[DEFAULT_ACCENT]));
  });

  it('uses iconColor and iconTint when given', async () => {
    await setup(<EmptyState heading="H" body="B" icon="accounts" iconColor={colors.danger} iconTint={colors.dangerTint1} />);
    expect(flat(screen.getByTestId('empty-state-tile', hidden)).backgroundColor).toBe(colors.dangerTint1);
  });

  it('iconSlot replaces the tile', async () => {
    await setup(<EmptyState heading="H" body="B" icon="accounts" iconSlot={<RNText testID="slot">*</RNText>} />);
    expect(screen.getByTestId('slot')).toBeTruthy();
    expect(screen.queryByTestId('empty-state-tile', hidden)).toBeNull();
  });

  it('heading is bodyStrong-weight and centred in the full form; body is centred and muted', async () => {
    await setup(<EmptyState heading="No accounts" body="Add one to start." icon="accounts" />);
    expect(flat(screen.getByText('No accounts')).textAlign).toBe('center');
    const body = flat(screen.getByText('Add one to start.'));
    expect(body.textAlign).toBe('center');
    expect(body.color).toBe(colors.inkMuted);
  });

  it('with actionLabel + onAction renders exactly one primary button', async () => {
    const onAction = jest.fn();
    await setup(<EmptyState heading="No accounts" body="Add one to start." icon="accounts" actionLabel="Add account" onAction={onAction} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.press(buttons[0]!);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('accentTintOver blends the accent at 12% over the base', () => {
    expect(accentTintOver('#FFFFFF', '#000000', 0.12)).toBe('#E0E0E0');
    expect(accentTintOver('#F1EFE8', '#F1EFE8')).toBe('#F1EFE8');
  });

  for (const m of MATRIX) {
    it(`fits at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await setup(
        <EmptyState
          heading="No accounts in this household yet"
          body="Add the first account and its opening balance to start recording money in and out."
          icon="accounts"
          actionLabel="Add an account"
          onAction={jest.fn()}
        />,
        m.scale,
      );
      expectFits();
    });
  }
});
