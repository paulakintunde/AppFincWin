/** D-76 rule S: the one place that decides when side-by-side text stacks. */
import { useWindowDimensions } from 'react-native';
import { useFontScale } from '@/theme/FontScaleProvider';

export const STACK_MIN_WIDTH = 360;
export const STACK_FONT_SCALE = 1.3;
export const STACK_VALUE_CHARS = 16;

export interface StackInput {
  width: number;
  fontScale: number;
  /** Label/value rows only: the length of the value text. */
  valueLength?: number;
}

/** True when width < 360, text scale > 1.3, or a value is longer than 16 characters. */
export function shouldStack({ width, fontScale, valueLength }: StackInput): boolean {
  return (
    width < STACK_MIN_WIDTH ||
    fontScale > STACK_FONT_SCALE ||
    (valueLength !== undefined && valueLength > STACK_VALUE_CHARS)
  );
}

export function useShouldStack(valueLength?: number): boolean {
  const { width } = useWindowDimensions();
  const fontScale = useFontScale();
  return shouldStack({ width, fontScale, valueLength });
}
