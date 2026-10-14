// The OS scales TextInput text natively; maxFontSizeMultiplier is the 2x cap (D-19). 03-14 checks
// the cap on device.
import React, { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInputProps } from 'react-native';
import { FONT_SCALE } from '@/theme/fontScale';

export type { TextInputProps };

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { maxFontSizeMultiplier = FONT_SCALE.body, ...rest },
  ref,
) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={maxFontSizeMultiplier} {...rest} />;
});
