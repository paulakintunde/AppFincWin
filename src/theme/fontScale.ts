// DSG-07 / D-19: body text and labels follow the OS setting to 200% (WCAG 1.4.4); large display
// figures and tab labels cap at about 1.3x. Applied manually from the OS font scale rather than via
// maxFontSizeMultiplier, which is reported ignored on Fabric (facebook/react-native issues 47499 and 35658;
// 03-RESEARCH Pitfall 2).
import type { TextStyle } from 'react-native';

export const FONT_SCALE = { body: 2, capped: 1.3 } as const;
export type FontScaleTier = keyof typeof FONT_SCALE;

type ScalableStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'letterSpacing'>;

export function effectiveScale(osScale: number, tier: FontScaleTier): number {
  if (!Number.isFinite(osScale) || osScale <= 0) return 1;
  return Math.min(osScale, FONT_SCALE[tier]);
}

export function scaleTextStyle(style: ScalableStyle, scale: number): ScalableStyle {
  if (scale === 1) return {};
  const out: ScalableStyle = {};
  if (typeof style.fontSize === 'number') out.fontSize = style.fontSize * scale;
  if (typeof style.lineHeight === 'number') out.lineHeight = style.lineHeight * scale;
  if (typeof style.letterSpacing === 'number') out.letterSpacing = style.letterSpacing * scale;
  return out;
}
