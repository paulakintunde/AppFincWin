import { FONT_PAIRINGS, type FontPairingKey } from './fonts';

/** BUILD-PROMPT.md §2 type scale, verbatim. */
export const fontSize = {
  tabLabel: 10.5,
  eyebrow: 11.5,
  meta: 12.5,
  label: 13,
  s13_5: 13.5,
  body: 15,
  sheetTitle: 16,
  heading: 26,
  healthScore: 32,
  netWorth: 42,
  display: 34,
} as const;

export type TextRole = 'display' | 'heading' | 'body' | 'label';

export interface ResolvedTextStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
}

/**
 * Resolves a semantic text role to concrete RN text style values for the active font
 * pairing. Roles per 00-UI-SPEC.md Typography: display 34 / lh 1.0 / display face;
 * heading 26 / weight 700 / lh 1.16 / letter-spacing -0.01em; body 15 / weight 500 /
 * lh 1.5; label 13 / weight 600 / lh 1.4. Em letter-spacing is converted to points as
 * `size * em`.
 */
export function textRole(pairing: FontPairingKey, role: TextRole): ResolvedTextStyle {
  const p = FONT_PAIRINGS[pairing];
  switch (role) {
    case 'display':
      return {
        fontFamily: p.display,
        fontSize: fontSize.display,
        lineHeight: fontSize.display * 1.0,
        letterSpacing: 0,
      };
    case 'heading':
      return {
        fontFamily: p.body[700],
        fontSize: fontSize.heading,
        lineHeight: fontSize.heading * 1.16,
        letterSpacing: fontSize.heading * -0.01,
      };
    case 'body':
      return {
        fontFamily: p.body[500],
        fontSize: fontSize.body,
        lineHeight: fontSize.body * 1.5,
        letterSpacing: 0,
      };
    case 'label':
      return {
        fontFamily: p.body[600],
        fontSize: fontSize.label,
        lineHeight: fontSize.label * 1.4,
        letterSpacing: 0,
      };
  }
}
