/** R1 "Scroll on open": the screen provides this; an opened row that lies above the viewport is scrolled to
 * `space.gapMd` under the sticky header. Fold lists and step 2 method cards call it with the opened row. */
import { createContext, useContext } from 'react';
import type { View } from 'react-native';

export type ScrollIntoView = (target: View | null) => void;

export const ScrollIntoViewContext = createContext<ScrollIntoView>(() => undefined);

export function useScrollIntoView(): ScrollIntoView {
  return useContext(ScrollIntoViewContext);
}
