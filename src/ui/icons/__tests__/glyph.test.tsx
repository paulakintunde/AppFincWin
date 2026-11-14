import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { iconSize, radii, rowHeight, step, tile } from '@/theme/layout';
import { BACK_OPACITY, Glyph } from '../Glyph';
import { IconTile } from '../IconTile';
import { ICONS, type IconName } from '../iconData';
import { CUSTOM_CATEGORY_ICONS, iconForAccountKind, iconForCategory } from '../iconFor';

jest.setTimeout(20000);

const opts = { includeHiddenElements: true };
const INK = '#123456';

const setup = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

type HostNode = { type: string; props: Record<string, unknown>; children: (HostNode | string)[] | null };

/** Every host node of a type in the rendered tree (react-native-svg renders RNSVG* hosts). */
function hosts(node: unknown, type: string, out: HostNode[] = []): HostNode[] {
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) hosts(n, type, out);
    return out;
  }
  const h = node as HostNode;
  if (h.type === type) out.push(h);
  for (const c of h.children ?? []) hosts(c, type, out);
  return out;
}

/** react-native-svg passes colours to the host as { type: 0, payload: 0xAARRGGBB }. */
const argb = (hex: string) => ({ type: 0, payload: parseInt(`FF${hex.slice(1)}`, 16) });

describe('Glyph (D-03, D-05)', () => {
  it('draws an Svg at 16, 20 and 24 with the 24 viewBox', async () => {
    for (const size of [16, 20, 24] as const) {
      const r = await setup(<Glyph name="groceries" size={size} color={INK} />);
      const svg = r.getByTestId('glyph-groceries', opts);
      expect(svg.props).toMatchObject({ width: size, height: size, vbWidth: 24, vbHeight: 24, minX: 0, minY: 0 });
      await r.unmount();
    }
  });

  it('defaults to 20', async () => {
    const r = await setup(<Glyph name="groceries" color={INK} />);
    expect(r.getByTestId('glyph-groceries', opts).props.width).toBe(20);
  });

  it('paints every colour sentinel in the color prop and draws the back layer at 45%', async () => {
    const r = await setup(<Glyph name="groceries" color={INK} />);
    const tree = r.toJSON();
    // groceries: back = basket path; front = rim rect + handle path (stroke, fill none).
    const back = hosts(tree, 'RNSVGGroup').find((g) => g.props.opacity === BACK_OPACITY);
    expect(BACK_OPACITY).toBe(0.45);
    expect(back).toBeDefined();
    const basket = hosts(back, 'RNSVGPath')[0];
    expect(basket?.props.d).toBe('M4.4 11h15.2l-1.5 8.3a2 2 0 0 1-2 1.7H7.9a2 2 0 0 1-2-1.7Z');
    expect(basket?.props.fill).toEqual(argb(INK));
    const paths = hosts(tree, 'RNSVGPath');
    const handle = paths.find((p) => p.props.d === 'M8 8.6 10.6 4M16 8.6 13.4 4');
    expect(handle?.props.stroke).toEqual(argb(INK));
    expect(handle?.props.strokeWidth).toBe(2);
    expect(handle?.props.fill).toBeNull();
    const rim = hosts(tree, 'RNSVGRect')[0];
    expect(rim?.props).toMatchObject({ x: 3, y: 8.6, width: 18, height: 3.2, rx: 1.6, fill: argb(INK) });
  });

  it('draws every icon in the one colour, no sentinel left over', async () => {
    const want = argb(INK).payload;
    for (const name of Object.keys(ICONS) as IconName[]) {
      const r = await setup(<Glyph name={name} color={INK} />);
      const tree = r.toJSON();
      const drawn = [...hosts(tree, 'RNSVGPath'), ...hosts(tree, 'RNSVGRect'), ...hosts(tree, 'RNSVGCircle')];
      expect(drawn.length).toBeGreaterThan(0);
      for (const el of drawn) {
        for (const key of ['fill', 'stroke'] as const) {
          const v = el.props[key] as { payload?: number } | null | undefined;
          if (v != null && v.payload !== undefined && v.payload !== 4278190080) expect(v.payload).toBe(want);
        }
      }
      await r.unmount();
    }
  });

  it('is hidden from accessibility by default', async () => {
    const r = await setup(<Glyph name="search" color={INK} />);
    const svg = r.getByTestId('glyph-search', opts);
    expect(svg.props.accessibilityElementsHidden).toBe(true);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('is an accessible image when given a label', async () => {
    const r = await setup(<Glyph name="close" color={INK} accessibilityLabel="Close" />);
    const svg = r.getByLabelText('Close');
    expect(svg.props.accessible).toBe(true);
    expect(svg.props.accessibilityRole).toBe('image');
    expect(svg.props.accessibilityElementsHidden).toBeUndefined();
  });
});

describe('IconTile (D-05, D-07, D-10)', () => {
  const style = (r: Awaited<ReturnType<typeof setup>>) => StyleSheet.flatten(r.getByTestId('tile', opts).props.style);

  it('size 36 draws a 20 glyph, corner 11, tinted', async () => {
    const r = await setup(<IconTile testID="tile" icon="housing" color={INK} tint="#E9F0EB" />);
    expect(style(r)).toMatchObject({ width: 36, height: 36, borderRadius: 11, backgroundColor: '#E9F0EB' });
    expect(r.getByTestId('glyph-housing', opts).props.width).toBe(20);
  });

  it('size 48 draws a 24 glyph', async () => {
    const r = await setup(<IconTile testID="tile" icon="add" size={48} color={INK} tint="#E9F0EB" />);
    expect(style(r)).toMatchObject({ width: 48, height: 48, borderRadius: radii.glyphTile });
    expect(r.getByTestId('glyph-add', opts).props.width).toBe(24);
  });

  it('shows the first letter in the colour when there is no icon', async () => {
    const r = await setup(<IconTile testID="tile" icon={null} letter="G" color={INK} tint="#E9F0EB" />);
    const letter = r.getByText('G', opts);
    expect(StyleSheet.flatten(letter.props.style).color).toBe(INK);
    expect(hosts(r.toJSON(), 'RNSVGSvgView')).toHaveLength(0);
  });

  it('is an empty tile with neither icon nor letter, and hidden from accessibility', async () => {
    const r = await setup(<IconTile testID="tile" icon={null} color={INK} tint="#E9F0EB" />);
    const t = r.getByTestId('tile', opts);
    expect(hosts(r.toJSON(), 'RNSVGSvgView')).toHaveLength(0);
    expect(r.queryByText(/./, opts)).toBeNull();
    expect(t.props.accessibilityElementsHidden).toBe(true);
    expect(t.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('iconFor maps', () => {
  it('maps a category by its builtin key, then its icon_key', () => {
    expect(iconForCategory({ builtin_key: 'Groceries' })).toBe('groceries');
    expect(iconForCategory({ builtin_key: null, icon_key: 'dining' })).toBe('dining');
    expect(iconForCategory({ builtin_key: null, icon_key: 'nope' })).toBeNull();
    expect(iconForCategory({ builtin_key: null, icon_key: 'toString' })).toBeNull();
    expect(iconForCategory(null)).toBeNull();
    expect(iconForCategory(undefined)).toBeNull();
  });

  it('covers all 15 seed category keys', () => {
    const keys = ['Housing', 'Utilities', 'Groceries', 'Transport', 'Insurance', 'Health', 'Subscriptions', 'Debt',
      'Savings', 'Business', 'Tax', 'Dining', 'Income', 'Transfer', 'Settlement'];
    for (const k of keys) expect(iconForCategory({ builtin_key: k })).not.toBeNull();
  });

  it('maps every account kind', () => {
    expect(iconForAccountKind('checking')).toBe('acctCurrent');
    expect(iconForAccountKind('credit')).toBe('acctCard');
    expect(iconForAccountKind('cash')).toBe('acctCash');
    expect(iconForAccountKind('other')).toBe('acctOther');
    expect(iconForAccountKind('savings')).toBe('acctSavings');
    expect(iconForAccountKind('loan')).toBe('acctLoan');
    expect(iconForAccountKind('investment')).toBe('acctInvestment');
  });

  it('offers custom categories our own icons only, no state shapes', () => {
    for (const name of CUSTOM_CATEGORY_ICONS) {
      expect(name in ICONS).toBe(true);
      expect(name.startsWith('state')).toBe(false);
    }
    expect(new Set(CUSTOM_CATEGORY_ICONS).size).toBe(CUSTOM_CATEGORY_ICONS.length);
  });
});

describe('size tokens (D-05, D-08..D-10)', () => {
  it('has the six steps, two row heights, two tiles and three icon sizes', () => {
    expect(step).toEqual({ hair: 4, tight: 8, row: 12, card: 16, edge: 22, section: 28 });
    expect(rowHeight).toEqual({ one: 52, two: 64 });
    expect(tile).toEqual({ row: 36, big: 48 });
    expect(iconSize).toEqual({ inline: 16, row: 20, big: 24 });
  });
});
