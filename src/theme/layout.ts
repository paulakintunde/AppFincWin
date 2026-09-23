import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** BUILD-PROMPT.md §2 shape: radii. */
export const radii = {
  card: 26,
  pill: 999,
  glyphTile: 11,
} as const;

/**
 * BUILD-PROMPT.md §2 / 00-UI-SPEC.md Spacing Scale, exact prototype pixel values —
 * not a generic 4-point/8-point scale. Do not round these.
 */
export const space = {
  screenH: 22,
  cardPad: 16,
  headerExtra: 21,
  sheetPadBottom: 30,
  sheetCornerPad: 22,
  groupGap: 18,
  rowPad: 15,
  gapSm: 8,
  gapMd: 12,
  pillPadV: 15,
  touchMin: 44,
} as const;

export interface ScreenInsets {
  headerTop: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * DSG-03: the first header block's top offset is always derived from the device's safe
 * area, never hardcoded (the prototype's reference-device 68px is `insets.top + 21` at
 * that device's insets, not a constant).
 */
export function useScreenInsets(): ScreenInsets {
  const i = useSafeAreaInsets();
  return { headerTop: i.top + space.headerExtra, bottom: i.bottom, left: i.left, right: i.right };
}
