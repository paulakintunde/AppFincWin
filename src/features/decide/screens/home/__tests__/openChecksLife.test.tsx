// 06.2-22 (D-23, D-13, board L08): Decide home's open checks are plain rows led by the state icon as a 36 tile in the state's
// tint, then the name, the badge word with the meta line, and the arrow. The spoken label and the press (a tick, then open) stay.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { colors, stateColors } from '@/theme/tokens';
import { hapticSelection } from '@/ui/haptics';
import { wrap } from '@/test/stepProps';
import type { OpenCheckRowModel } from '../homeCardsModel';
import { OPEN_CHECK_DRAFT_ICON, OPEN_CHECK_TILE_ICON, OpenChecksCard } from '../OpenChecksCard';

// The Glyph as a plain host view carrying its name, size and colour, so the tile's icon and its colour can be read.
jest.mock('@/ui/icons/Glyph', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Glyph: (p: { name: string; size?: number; color: string; testID?: string }) =>
      R.createElement(View, { testID: p.testID ?? `glyph-${p.name}`, glyphName: p.name, glyphSize: p.size, glyphColor: p.color } as Record<string, unknown>),
  };
});
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticTick: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));

const money = (n: number) => `$${n / 100}`;
const date = (d: string) => `on ${d}`;

const row = (over: Partial<OpenCheckRowModel> = {}): OpenCheckRowModel => ({
  id: 'k1',
  name: 'Headphones',
  price: 18_000,
  date: '2026-12-15',
  left: 23_100,
  code: 'fits_month',
  variant: null,
  once: true,
  draft: false,
  payNotChosen: false,
  changed: false,
  checkedOn: '2026-10-22',
  ...over,
});

const props = { formatMoney: money, formatMoneySpoken: money, formatDate: date, today: '2026-11-11', onOpen: jest.fn(), onAddPurchase: jest.fn() };

function flat(style: unknown): Record<string, unknown> {
  const list = Array.isArray(style) ? style.flat(Infinity) : [style];
  return Object.assign({}, ...list.filter((s) => s !== null && typeof s === 'object'));
}

const hidden = { includeHiddenElements: true };

/** The one Glyph inside a tile: its name and colour. */
function tileGlyph(testID: string): { name: string; color: string } {
  const glyph = within(screen.getByTestId(testID, hidden)).getAllByTestId(/^glyph-/, hidden)[0]!;
  return { name: glyph.props.glyphName as string, color: glyph.props.glyphColor as string };
}

beforeEach(() => jest.clearAllMocks());

describe('OpenChecksCard rows (06.2-22, D-23)', () => {
  it('maps every state tone to a set icon (cond and extra take the closest L07 glyphs)', () => {
    expect(OPEN_CHECK_TILE_ICON).toEqual({
      fits: 'stateFits',
      tight: 'stateTight',
      short: 'stateShort',
      net: 'stateSafetyNet',
      notYet: 'stateDue',
      cond: 'stateTight',
      extra: 'stateUp',
    });
    expect(OPEN_CHECK_DRAFT_ICON).toBe('firstEntry');
  });

  it.each([
    ['fits', 'fits_month', null, 'stateFits'],
    ['tight', 'fits_month', 'tight', 'stateTight'],
    ['short', 'monthly_short', null, 'stateShort'],
    ['net', 'fits_uses_net', null, 'stateSafetyNet'],
    ['notYet', 'not_yet', null, 'stateDue'],
    ['cond', 'fits_by_borrowing', null, 'stateTight'],
    ['extra', 'fits_unspent', 'extra_savings', 'stateUp'],
  ] as const)('a %s row leads with its icon in the state stroke on the state tint', async (tone, code, variant, icon) => {
    await wrap(<OpenChecksCard rows={[row({ id: 'r', code, variant })]} {...props} />);
    const tile = screen.getByTestId('open-check-tile-r', hidden);
    expect(flat(tile.props.style)).toMatchObject({ width: 36, height: 36, backgroundColor: stateColors[tone].tint });
    expect(tileGlyph('open-check-tile-r')).toEqual({ name: icon, color: stateColors[tone].stroke });
  });

  it('a draft tile is neutral with the pen in a square', async () => {
    await wrap(<OpenChecksCard rows={[row({ id: 'd', code: null, draft: true, left: null })]} {...props} />);
    expect(flat(screen.getByTestId('open-check-tile-d', hidden).props.style)).toMatchObject({ backgroundColor: colors.fill1 });
    expect(tileGlyph('open-check-tile-d')).toEqual({ name: 'firstEntry', color: colors.inkDim });
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('keeps the badge word and the meta line, and nothing else on the row is tinted (D-13)', async () => {
    await wrap(<OpenChecksCard rows={[row({ id: 'f' })]} {...props} />);
    expect(screen.getByTestId('open-check-badge-f')).toBeTruthy();
    expect(screen.getByText('Headphones')).toBeTruthy();
    expect(screen.getByText(/\$180 · on 2026-12-15 · leaves \$231/)).toBeTruthy();
    const rowStyle = flat(screen.getByTestId('open-check-row-f').props.style);
    expect(rowStyle).toMatchObject({ minHeight: 64, gap: 12, flexDirection: 'row', backgroundColor: 'transparent' });
    const name = flat(screen.getByText('Headphones').props.style);
    expect(name.color).toBe(colors.ink);
  });

  it('ends in the arrow', async () => {
    await wrap(<OpenChecksCard rows={[row({ id: 'a' })]} {...props} />);
    const arrow = within(screen.getByTestId('open-check-row-a')).getByTestId('glyph-arrowRight', hidden);
    expect(arrow.props).toMatchObject({ glyphSize: 16, glyphColor: colors.inkFaint });
  });

  it('the spoken label is unchanged (same parts, same order)', async () => {
    await wrap(<OpenChecksCard rows={[row({ id: 'f' })]} {...props} />);
    expect(String(screen.getByTestId('open-check-row-f').props.accessibilityLabel)).toMatch(/^Headphones, [^,]+, \$180, on 2026-12-15, leaves \$231$/);
  });

  it('the tile is hidden from screen readers', async () => {
    await wrap(<OpenChecksCard rows={[row({ id: 'h' })]} {...props} />);
    const tile = screen.getByTestId('open-check-tile-h', hidden);
    expect(tile.props.accessible).toBe(false);
    expect(tile.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('a press is still a tick and opens the check', async () => {
    const onOpen = jest.fn();
    await wrap(<OpenChecksCard rows={[row({ id: 'p' })]} {...props} onOpen={onOpen} />);
    await fireEvent.press(screen.getByTestId('open-check-row-p'));
    expect(hapticSelection).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('p');
  });
});
