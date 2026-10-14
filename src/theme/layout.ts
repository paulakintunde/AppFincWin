import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** BUILD-PROMPT.md §2 shape: radii. */
export const radii = {
  card: 26,
  pill: 999,
  glyphTile: 11,
  /** Prototype `border-radius:28px 28px 0 0`, 25 sheets, UI-SPEC. */
  sheetTop: 28,
  /** Prototype toast pill radius (html 2794), UI-SPEC toast-radius. */
  toast: 18,
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
  /** Entry-sheet field rows (dense variant). */
  rowPadDense: 13,
  /** Home card inner padding, prototype L112/L127/L160; UI-SPEC home-card-pad. */
  cardPadLg: 20,
  /** FAB placement and padding (prototype html 1880-1888). */
  fabInset: 16,
  fabPadL: 16,
  fabPadR: 19,
  fabGap: 9,
  /** Tab bar (UI-SPEC tab-bar-pad; bottom is Math.max(insets.bottom, tabBarPadBottomMin)). */
  tabBarPadTop: 9,
  tabBarPadH: 6,
  tabBarPadBottomMin: 12,
  tabBarGap: 2,
  tabItemGap: 5,
  tabItemPadV: 4,
  /** Headers (prototype html 53-62 and 1995-2002). */
  tabHeaderPadBottom: 10,
  tabHeaderGap: 14,
  eyebrowGap: 7,
  detailHeaderPadTop: 15,
  detailHeaderPadH: 18,
  detailHeaderPadBottom: 12,
  chevronNudge: 3,
} as const;

/** Phase 3 shell and Home element sizes, verbatim from the prototype (03-UI-SPEC Spacing Scale). */
export const size = {
  tabIcon: 22,
  avatar: 42,
  backCompact: 36,
  backDetail: 38,
  fab: 50,
  fabIcon: 20,
  fabBarLong: 14,
  fabBarThin: 2.2,
  sheetHandleW: 38,
  sheetHandleH: 4,
  sheetHandleHit: 44,
  chevronCompact: 8,
  chevronDetail: 9,
  homeQuickCircle: 52,
  homeBarHeight: 8,
  homeDateBlock: 38,
  homeAccountTile: 34,
} as const;

export interface ScreenInsets {
  top: number;
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
  return { top: i.top, headerTop: i.top + space.headerExtra, bottom: i.bottom, left: i.left, right: i.right };
}
