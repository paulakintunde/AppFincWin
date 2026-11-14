/**
 * 06.1-62 (H-1, CB-5 / CF-1 / CB-6): the shared "your tap landed" feedback.
 *
 * Android: a native ripple (`android_ripple`). It is drawn by the platform, so it shows the moment a
 * finger lands even while the JS thread is busy for seconds after an action (plan 51 Pixel 6 timings).
 * iOS: the app-wide pressed opacity (PRESSED_OPACITY, the prototype's :active value).
 *
 * Colours are existing theme tokens only (DSG-02, no new colours): 'fill' is for controls painted with a
 * strong fill (the accent primary pill, a chip on the ink card), so a light token reads on it; 'row' is for
 * light or transparent surfaces, so a darker hairline token reads on it.
 */
import { Platform, type PressableAndroidRippleConfig, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY } from '@/theme/layout';

export type PressFeedbackKind = 'fill' | 'row';

export interface PressFeedback {
  android_ripple: PressableAndroidRippleConfig | undefined;
  pressedStyle: (pressed: boolean) => ViewStyle;
}

/**
 * Text links stay 44 dp (space.touchMin, the prototype's 44 px target rule) and reach 52 dp tall through this
 * slop. The sides are 12 so two links in one row (the answer's Back and New check) never meet.
 */
export const LINK_HIT_SLOP = { top: 4, bottom: 4, left: 12, right: 12 } as const;

const IOS_PRESSED: ViewStyle = { opacity: PRESSED_OPACITY };
const NONE: ViewStyle = {};

export function usePressFeedback(kind: PressFeedbackKind): PressFeedback {
  const { colors } = useTheme();
  if (Platform.OS === 'android') {
    return {
      android_ripple: { color: kind === 'fill' ? colors.fill6 : colors.line4, borderless: false, foreground: true },
      pressedStyle: () => NONE,
    };
  }
  return { android_ripple: undefined, pressedStyle: (pressed) => (pressed ? IOS_PRESSED : NONE) };
}
