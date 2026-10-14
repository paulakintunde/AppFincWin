import React, { forwardRef } from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { effectiveScale, scaleTextStyle, type FontScaleTier } from '@/theme/fontScale';
import { useFontScale } from '@/theme/FontScaleProvider';

export interface TextProps extends RNTextProps {
  /** D-19 tier: 'body' (default) up to 2x, 'capped' up to 1.3x for display figures and tab labels. */
  scale?: FontScaleTier;
}

export const Text = forwardRef<RNText, TextProps>(function Text(
  { scale = 'body', style, allowFontScaling, ...rest },
  ref,
) {
  const os = useFontScale();
  if (allowFontScaling === false) {
    return <RNText ref={ref} {...rest} allowFontScaling={false} style={style} />;
  }
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const scaled = scaleTextStyle(flat, effectiveScale(os, scale));
  return <RNText ref={ref} {...rest} allowFontScaling={false} style={[style, scaled]} />;
});
