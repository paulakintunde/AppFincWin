// D-56: drawn in the TabGlyphs style; no icon library (CLAUDE.md).
// Coordinates are the UI-SPEC "Glyph drawing spec": 22-unit grid, rounded strokes, 0.45 / 0.7 two-tone.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { size } from '@/theme/layout';

// UI-SPEC "drawn glyph, 10px box": the filter-chip close glyph.
const CLOSE_GLYPH = 10;

type GlyphProps = { color: string };

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Svg
      width={size.tabIcon}
      height={size.tabIcon}
      viewBox="0 0 22 22"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Svg>
  );
}

export function SearchGlyph({ color }: GlyphProps): React.JSX.Element {
  return (
    <Frame>
      <Circle cx={9.6} cy={9.6} r={5.9} fill="none" stroke={color} strokeWidth={2.2} opacity={1} />
      <Path
        d="M14.2 14.2 18.6 18.6"
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
      />
    </Frame>
  );
}

export function FilterGlyph({ color }: GlyphProps): React.JSX.Element {
  return (
    <Frame>
      <Rect x={3} y={4} width={16} height={2.4} rx={1.2} fill={color} opacity={1} />
      <Rect x={6} y={9.8} width={10} height={2.4} rx={1.2} fill={color} opacity={0.7} />
      <Rect x={8.5} y={15.6} width={5} height={2.4} rx={1.2} fill={color} opacity={0.45} />
    </Frame>
  );
}

export function MoreGlyph({ color }: GlyphProps): React.JSX.Element {
  return (
    <Frame>
      <Circle cx={4.5} cy={11} r={2.1} fill={color} opacity={0.45} />
      <Circle cx={11} cy={11} r={2.1} fill={color} opacity={1} />
      <Circle cx={17.5} cy={11} r={2.1} fill={color} opacity={0.45} />
    </Frame>
  );
}

export function CloseGlyph({ color }: GlyphProps): React.JSX.Element {
  return (
    <Svg
      width={CLOSE_GLYPH}
      height={CLOSE_GLYPH}
      viewBox="0 0 10 10"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M2 2 8 8" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 2 2 8" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export type HeaderGlyphName = 'search' | 'filter' | 'more';

export function HeaderGlyph({ name, color }: { name: HeaderGlyphName; color: string }): React.JSX.Element {
  if (name === 'search') return <SearchGlyph color={color} />;
  if (name === 'filter') return <FilterGlyph color={color} />;
  return <MoreGlyph color={color} />;
}
