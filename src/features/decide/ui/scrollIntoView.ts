/** R1 "Scroll on open": the screen provides this; an opened row is scrolled to `space.gapMd` under the sticky header.
 * Fold lists call it with the opened row (`ifAbove`: only when the row lies above the viewport); step 2 method cards
 * call it with `top`, so the card's header sits under the sticky header and its body is in view even when the header
 * was already visible lower down. */
import { createContext, useContext } from 'react';
import type { View } from 'react-native';
import { space } from '@/theme/layout';

export type ScrollAlign = 'ifAbove' | 'top';
export type ScrollIntoView = (target: View | null, align?: ScrollAlign) => void;

export const ScrollIntoViewContext = createContext<ScrollIntoView>(() => undefined);

export function useScrollIntoView(): ScrollIntoView {
  return useContext(ScrollIntoViewContext);
}

/** The scroll offset to move to, or null to stay put. `y` is the target's top in the scroll content, `offset` the current scroll. */
export function scrollTargetY({ y, offset, align }: { y: number; offset: number; align: ScrollAlign }): number | null {
  const wanted = Math.max(0, y - space.gapMd);
  if (align === 'top') return wanted === offset ? null : wanted;
  return y < offset + space.gapMd ? wanted : null;
}
