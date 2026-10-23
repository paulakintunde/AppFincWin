// The OS scales TextInput text natively; maxFontSizeMultiplier is the 2x cap (D-19). Confirmed on
// device: A12 PASS on Pixel 9 (2026-10-14), typed text capped. Re-check on iOS at I3.
import React, { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInputProps } from 'react-native';
import { FONT_SCALE } from '@/theme/fontScale';

export type { TextInputProps };

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { maxFontSizeMultiplier = FONT_SCALE.body, textBreakStrategy = 'simple', ...rest },
  ref,
) {
  return (
    <RNTextInput
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      textBreakStrategy={textBreakStrategy}
      {...rest}
    />
  );
});

// Instance type, so `useRef<TextInput>(null)` keeps working like the react-native class did.
export type TextInput = RNTextInput;
