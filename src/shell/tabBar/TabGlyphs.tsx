// D-01 / D-02: the five prototype tab glyphs, unchanged (FincWin United.dc.html 1855-1878).
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { size } from '@/theme/layout';
import type { TabId } from './tabs';

export function TabGlyph({ name, color }: { name: TabId; color: string }): React.JSX.Element {
  return (
    <Svg
      width={size.tabIcon}
      height={size.tabIcon}
      viewBox="0 0 22 22"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === 'home' ? (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={2} fill={color} />
          <Rect x={12} y={3} width={7} height={7} rx={2} fill={color} opacity={0.45} />
          <Rect x={3} y={12} width={7} height={7} rx={2} fill={color} opacity={0.45} />
          <Rect x={12} y={12} width={7} height={7} rx={2} fill={color} />
        </>
      ) : null}
      {name === 'activity' ? (
        <>
          <Rect x={3} y={4} width={16} height={2.4} rx={1.2} fill={color} />
          <Rect x={3} y={9.8} width={11} height={2.4} rx={1.2} fill={color} opacity={0.45} />
          <Rect x={3} y={15.6} width={14} height={2.4} rx={1.2} fill={color} opacity={0.7} />
        </>
      ) : null}
      {name === 'decide' ? (
        <>
          <Path d="M11 3.2 18.4 11 11 18.8 3.6 11Z" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
          <Path
            d="M7.9 11.1l2.2 2.2 4.1-4.4"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {name === 'grow' ? (
        <>
          <Rect x={3} y={13} width={4} height={6} rx={1.4} fill={color} opacity={0.45} />
          <Rect x={9} y={8} width={4} height={11} rx={1.4} fill={color} opacity={0.7} />
          <Rect x={15} y={3} width={4} height={16} rx={1.4} fill={color} />
        </>
      ) : null}
      {name === 'insights' ? (
        <>
          <Circle cx={11} cy={11} r={8} fill="none" stroke={color} strokeWidth={2.2} />
          <Circle cx={11} cy={11} r={2.6} fill={color} />
        </>
      ) : null}
    </Svg>
  );
}
