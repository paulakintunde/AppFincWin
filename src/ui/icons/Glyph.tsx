/**
 * 06.2 D-03 / D-05: one FincWin icon, drawn from the generated board data (iconData.ts, D-29) in a single colour.
 * The board's back layer is drawn at 45% opacity, the front layer solid. Sizes are 16 (inline, beside a word in
 * chips and badges), 20 (inside a 36 row tile) and 24 (inside a 48 big tile) only.
 *
 * Decorative by default: every icon has a word beside it (D-06), so the glyph is hidden from screen readers unless
 * an accessibilityLabel is given (the icon-only cases: search, close, back, more, add).
 */
import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { ICONS, type IconName, type IconNode } from './iconData';

export type GlyphSize = 16 | 20 | 24;

export interface GlyphProps {
  name: IconName;
  size?: GlyphSize;
  color: string;
  accessibilityLabel?: string;
  testID?: string;
}

/** The board's back-layer opacity (`<g opacity=".45">`). */
export const BACK_OPACITY = 0.45;

const COLOR_SENTINEL = 'C';
const NUMERIC = new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'stroke-width', 'opacity']);
const CAMEL: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
};

function nodeProps(attrs: IconNode['attrs'], color: string): Record<string, string | number> {
  const props: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const prop = CAMEL[key] ?? key;
    if ((key === 'fill' || key === 'stroke') && value === COLOR_SENTINEL) props[prop] = color;
    else props[prop] = NUMERIC.has(key) ? Number(value) : value;
  }
  return props;
}

function renderNodes(nodes: readonly IconNode[], color: string): React.ReactNode[] {
  return nodes.map((node, i) => {
    const props = nodeProps(node.attrs, color);
    switch (node.tag) {
      case 'g':
        return (
          <G key={i} {...props}>
            {renderNodes(node.children ?? [], color)}
          </G>
        );
      case 'path':
        return <Path key={i} {...props} />;
      case 'rect':
        return <Rect key={i} {...props} />;
      case 'circle':
        return <Circle key={i} {...props} />;
    }
  });
}

function GlyphDrawing({ name, size = 20, color, accessibilityLabel, testID }: GlyphProps): React.JSX.Element {
  const icon = ICONS[name];
  const a11y =
    accessibilityLabel !== undefined
      ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
      : {
          accessible: false,
          importantForAccessibility: 'no-hide-descendants' as const, // Android
          accessibilityElementsHidden: true, // iOS
        };
  return (
    <Svg width={size} height={size} viewBox={icon.viewBox} testID={testID ?? `glyph-${name}`} {...a11y}>
      {icon.back.length > 0 ? <G opacity={BACK_OPACITY}>{renderNodes(icon.back, color)}</G> : null}
      {renderNodes(icon.front, color)}
    </Svg>
  );
}

const MemoGlyph = React.memo(GlyphDrawing);

export function Glyph(props: GlyphProps): React.JSX.Element {
  return <MemoGlyph {...props} />;
}
