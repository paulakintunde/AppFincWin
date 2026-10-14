import React, { createContext, forwardRef, useContext } from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { effectiveScale, scaleTextStyle, type FontScaleTier } from '@/theme/fontScale';
import { useFontScale } from '@/theme/FontScaleProvider';

/** True inside a Text, so a nested Text without a fontSize keeps inheriting its parent's. */
const TextNestingContext = createContext(false);

/** React Native's default Text size; used only to scale a top-level Text that sets no fontSize (M9). */
const RN_DEFAULT_FONT_SIZE = 14;

export interface TextProps extends RNTextProps {
  /** D-19 tier: 'body' (default) up to 2x, 'capped' up to 1.3x for display figures and tab labels. */
  scale?: FontScaleTier;
}

export const Text = forwardRef<RNText, TextProps>(function Text(
  { scale = 'body', style, allowFontScaling, children, ...rest },
  ref,
) {
  const os = useFontScale();
  const nested = useContext(TextNestingContext);
  if (allowFontScaling === false) {
    return (
      <RNText ref={ref} {...rest} allowFontScaling={false} style={style}>
        {withNesting(children)}
      </RNText>
    );
  }
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const base = typeof flat.fontSize === 'number' || nested ? flat : { ...flat, fontSize: RN_DEFAULT_FONT_SIZE };
  const scaled = scaleTextStyle(base, effectiveScale(os, scale));
  // At scale 1 the caller style passes through untouched (same reference).
  const merged = Object.keys(scaled).length > 0 ? [style, scaled] : style;
  return (
    <RNText ref={ref} {...rest} allowFontScaling={false} style={merged}>
      {withNesting(children)}
    </RNText>
  );
});

/** Plain strings and numbers cannot contain a nested Text, so they skip the provider (children stay as given). */
function withNesting(children: React.ReactNode): React.ReactNode {
  if (children === undefined || children === null || typeof children === "string" || typeof children === "number") {
    return children;
  }
  return <TextNestingContext.Provider value>{children}</TextNestingContext.Provider>;
}
