// 06-09: Grow's glyphs, drawn in the app's own two-layer style (a soft fill at .45 under a stroke), 22-unit grid.
// No icon library (CLAUDE.md design fidelity). Decorative: hidden from the accessibility tree, the row or badge words carry meaning.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export const GROW_GLYPH_NAMES = [
  'lock',
  'calendar',
  'laptop',
  'phone',
  'camera',
  'savings',
  'housing',
  'transport',
  'headphones',
  'debt',
  'card',
  'invest',
  'pension',
  'checkbuy',
  'target',
  'bills',
  'view',
  'minus',
  'plus',
  'chev',
  'sCheck',
  'sHalf',
  'sOver',
  'sUp',
  'sDown',
  'sClock',
  'sQuestion',
] as const;
export type GrowGlyphName = (typeof GROW_GLYPH_NAMES)[number];

export interface GrowGlyphProps {
  name: GrowGlyphName;
  color: string;
  size?: number;
}

const SOFT = 0.45;
const STROKE = 2;

function Shape({ name, color }: { name: GrowGlyphName; color: string }): React.JSX.Element {
  const line = { fill: 'none', stroke: color, strokeWidth: STROKE, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (name) {
    case 'lock':
      return (
        <>
          <Rect x={4} y={9.5} width={14} height={9.5} rx={2.6} fill={color} opacity={SOFT} />
          <Path d="M7 9.5V7.2a4 4 0 0 1 8 0v2.3" {...line} />
          <Circle cx={11} cy={14.2} r={1.3} fill={color} />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x={3.5} y={5} width={15} height={13.5} rx={3} fill={color} opacity={SOFT} />
          <Path d="M7.5 3.2v3.4M14.5 3.2v3.4M3.5 9.6h15" {...line} />
        </>
      );
    case 'laptop':
      return (
        <>
          <Rect x={5} y={5} width={12} height={8.5} rx={2} fill={color} opacity={SOFT} />
          <Path d="M5 5h12v8.5H5zM2.8 16.8h16.4" {...line} />
        </>
      );
    case 'phone':
      return (
        <>
          <Rect x={6.5} y={3} width={9} height={16} rx={2.6} fill={color} opacity={SOFT} />
          <Path d="M6.5 5.6a2.6 2.6 0 0 1 2.6-2.6h3.8a2.6 2.6 0 0 1 2.6 2.6v10.8a2.6 2.6 0 0 1-2.6 2.6H9.1a2.6 2.6 0 0 1-2.6-2.6zM10 16.2h2" {...line} />
        </>
      );
    case 'camera':
      return (
        <>
          <Rect x={3} y={6.5} width={16} height={11.5} rx={3} fill={color} opacity={SOFT} />
          <Path d="M7.5 6.5l1.2-2.2h4.6l1.2 2.2" {...line} />
          <Circle cx={11} cy={12} r={2.8} {...line} />
        </>
      );
    case 'savings':
      return (
        <>
          <Circle cx={11} cy={11.5} r={7.5} fill={color} opacity={SOFT} />
          <Circle cx={11} cy={11.5} r={7.5} {...line} />
          <Path d="M11 7.6v7.8M8.9 9.6c0-1 .9-1.6 2.1-1.6s2.1.6 2.1 1.5c0 2.2-4.2 1.2-4.2 3.3 0 .9.9 1.6 2.1 1.6s2.1-.6 2.1-1.5" {...line} strokeWidth={1.6} />
        </>
      );
    case 'housing':
      return (
        <>
          <Path d="M4.5 10.5 11 4.5l6.5 6v7.5h-13z" fill={color} opacity={SOFT} />
          <Path d="M3.5 11 11 4l7.5 7M5.5 9.5V18h11V9.5M9 18v-4.5h4V18" {...line} />
        </>
      );
    case 'transport':
      return (
        <>
          <Rect x={3} y={9} width={16} height={6.5} rx={2.4} fill={color} opacity={SOFT} />
          <Path d="M5 9l1.6-3.6h8.8L17 9M3 9h16v6.5H3z" {...line} />
          <Circle cx={7} cy={16.5} r={1.7} fill={color} />
          <Circle cx={15} cy={16.5} r={1.7} fill={color} />
        </>
      );
    case 'headphones':
      return (
        <>
          <Rect x={3.5} y={11} width={4.5} height={7} rx={2} fill={color} opacity={SOFT} />
          <Rect x={14} y={11} width={4.5} height={7} rx={2} fill={color} opacity={SOFT} />
          <Path d="M4 14v-2.5a7 7 0 0 1 14 0V14M3.5 11.5h4.5v6.5H5.8a2.3 2.3 0 0 1-2.3-2.3zM14 11.5h4.5v4.2a2.3 2.3 0 0 1-2.3 2.3H14z" {...line} />
        </>
      );
    case 'debt':
      return (
        <>
          <Rect x={3} y={5} width={16} height={12} rx={3} fill={color} opacity={SOFT} />
          <Path d="M3 8.5h16M7 13.5h4" {...line} />
        </>
      );
    case 'card':
      return (
        <>
          <Rect x={2.8} y={5} width={16.4} height={12} rx={3} fill={color} opacity={SOFT} />
          <Path d="M2.8 9h16.4" {...line} strokeWidth={2.6} />
          <Path d="M6 13.5h3.5" {...line} />
        </>
      );
    case 'invest':
      return (
        <>
          <Rect x={3} y={13} width={4} height={6} rx={1.4} fill={color} opacity={SOFT} />
          <Rect x={9} y={9} width={4} height={10} rx={1.4} fill={color} opacity={0.7} />
          <Path d="M3.5 9 8.4 5.4l3.4 2.6L18.5 3M15 3h3.5v3.5" {...line} />
        </>
      );
    case 'pension':
      return (
        <>
          <Path d="M3.5 9 11 4l7.5 5z" fill={color} opacity={SOFT} />
          <Path d="M3.5 9 11 4l7.5 5zM5.5 10.5v6M9 10.5v6M13 10.5v6M16.5 10.5v6M3.5 18.5h15" {...line} />
        </>
      );
    case 'checkbuy':
      return (
        <>
          <Path d="M11 3.2 18.4 11 11 18.8 3.6 11z" fill={color} opacity={SOFT} />
          <Path d="M11 3.2 18.4 11 11 18.8 3.6 11zM7.9 11.1l2.2 2.2 4.1-4.4" {...line} />
        </>
      );
    case 'target':
      return (
        <>
          <Circle cx={11} cy={11} r={7.6} fill={color} opacity={SOFT} />
          <Circle cx={11} cy={11} r={7.6} {...line} />
          <Circle cx={11} cy={11} r={3.6} {...line} />
          <Circle cx={11} cy={11} r={1.1} fill={color} />
        </>
      );
    case 'bills':
      return (
        <>
          <Path d="M5 3.5h12v15l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" fill={color} opacity={SOFT} />
          <Path d="M5 3.5h12v15l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4zM8 8h6M8 11.5h4" {...line} />
        </>
      );
    case 'view':
      return (
        <>
          <Path d="M2.5 11s3.2-6 8.5-6 8.5 6 8.5 6-3.2 6-8.5 6-8.5-6-8.5-6z" fill={color} opacity={SOFT} />
          <Path d="M2.5 11s3.2-6 8.5-6 8.5 6 8.5 6-3.2 6-8.5 6-8.5-6-8.5-6z" {...line} />
          <Circle cx={11} cy={11} r={2.4} fill={color} />
        </>
      );
    case 'minus':
      return <Path d="M5 11h12" {...line} strokeWidth={2.4} />;
    case 'plus':
      return <Path d="M5 11h12M11 5v12" {...line} strokeWidth={2.4} />;
    case 'chev':
      return <Path d="M8.5 5l6 6-6 6" {...line} strokeWidth={2.2} />;
    case 'sCheck':
      return (
        <>
          <Circle cx={11} cy={11} r={8} fill={color} opacity={SOFT} />
          <Path d="M7.2 11.2l2.5 2.5 5-5.4" {...line} />
        </>
      );
    case 'sHalf':
      return (
        <>
          <Circle cx={11} cy={11} r={7.5} {...line} />
          <Path d="M11 3.5a7.5 7.5 0 0 1 0 15z" fill={color} />
        </>
      );
    case 'sOver':
      return (
        <>
          <Path d="M11 3.5 19 17.5H3z" fill={color} opacity={SOFT} />
          <Path d="M11 3.5 19 17.5H3zM11 9v4" {...line} />
          <Circle cx={11} cy={15.2} r={0.4} {...line} strokeWidth={1.6} />
        </>
      );
    case 'sUp':
      return (
        <>
          <Path d="M11 4 18 12h-4.2v5.5H8.2V12H4z" fill={color} opacity={SOFT} />
          <Path d="M11 17.5V6.5M6.5 10.5 11 6l4.5 4.5" {...line} />
        </>
      );
    case 'sDown':
      return (
        <>
          <Path d="M11 18 4 10h4.2V4.5h5.6V10H18z" fill={color} opacity={SOFT} />
          <Path d="M11 4.5v11M6.5 11.5 11 16l4.5-4.5" {...line} />
        </>
      );
    case 'sClock':
      return (
        <>
          <Circle cx={11} cy={11} r={8} fill={color} opacity={SOFT} />
          <Circle cx={11} cy={11} r={8} {...line} />
          <Path d="M11 6.6V11l3 2" {...line} />
        </>
      );
    case 'sQuestion':
      return (
        <>
          <Circle cx={11} cy={11} r={8} fill={color} opacity={SOFT} />
          <Circle cx={11} cy={11} r={8} {...line} />
          <Path d="M8.6 8.8a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 1.9-2.4 3.4" {...line} />
          <Circle cx={11} cy={15.4} r={0.4} {...line} strokeWidth={1.8} />
        </>
      );
  }
}

export function GrowGlyph({ name, color, size = 20 }: GrowGlyphProps): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      testID={`grow-glyph-${name}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Shape name={name} color={color} />
    </Svg>
  );
}
