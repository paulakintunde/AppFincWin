/**
 * The complete BUILD-PROMPT.md §2 colour palette, verbatim. This is the whole palette —
 * no colour is added beyond §2 and the prototype's Component.COL / Component.TINT maps
 * (FincWin United.dc.html lines 3217-3218). DSG-02 is enforced by
 * src/theme/__tests__/noRawColours.test.ts: any hex/rgb literal outside this file,
 * src/theme/accents.ts or src/features/auth/brand/ fails CI.
 */
export const colors = {
  surface: '#FFFFFF',
  canvas: '#FBFAF7',
  shell: '#E7E4DC',
  ink: '#14150F',
  inkMuted: '#6E6A5E',
  inkFaint: '#767161',
  inkDim: '#5C5A50',
  inkSoft1: '#A8A79C',
  inkSoft2: '#BFBEB4',
  inkSoft3: '#C6C2B6',
  accentTint1: '#EAF1EC',
  accentTint2: '#E9F0EB',
  accentTint3: '#F4F7F4',
  danger: '#B4472A',
  dangerTint1: '#F6EAE6',
  dangerTint2: '#F3E6E1',
  dangerTint3: '#F6EAE5',
  warn1: '#8A5A1B',
  warn2: '#7E6020',
  line1: '#EDEAE1',
  line2: '#E2DED2',
  line3: '#E5E2D7',
  line4: '#D9D5C9',
  fill1: '#F1EFE8',
  fill2: '#F2EFE7',
  fill3: '#F5F3ED',
  fill4: '#F4F2EB',
  fill5: '#FAF8F3',
  fill6: '#F6F4EE',
  tabBar: 'rgba(251,250,247,.94)',
} as const;

/**
 * Component.COL / Component.TINT, copied verbatim from FincWin United.dc.html lines 3217-3218.
 * 15 categories including Income, Settlement and Transfer.
 */
export const categoryColor = {
  Housing: '#1B4D3E',
  Utilities: '#5A6472',
  Groceries: '#2F6E68',
  Transport: '#5A6472',
  Insurance: '#3E5C6B',
  Health: '#2F6E68',
  Subscriptions: '#6E4A63',
  Debt: '#B4472A',
  Savings: '#1B4D3E',
  Business: '#7E6020',
  Tax: '#B4472A',
  Dining: '#7E6020',
  Income: '#1B4D3E',
  Settlement: '#5A6472',
  Transfer: '#5A6472',
} as const;

export const categoryTint = {
  Housing: '#E9F0EB',
  Utilities: '#ECEEF1',
  Groceries: '#E6EFEE',
  Transport: '#ECEEF1',
  Insurance: '#EAEEF1',
  Health: '#E6EFEE',
  Subscriptions: '#F0EAEF',
  Debt: '#F6EAE6',
  Savings: '#E9F0EB',
  Business: '#F4EFE3',
  Tax: '#F6EAE6',
  Dining: '#F4EFE3',
  Income: '#E9F0EB',
  Settlement: '#ECEEF1',
  Transfer: '#EDEAE1',
} as const;

export type CategoryKey = keyof typeof categoryColor;

/** Component.HHCOL, FincWin United.dc.html line 3216. */
export const memberColors = ['#1B4D3E', '#B4472A', '#3E5C6B', '#7E6020', '#6E4A63', '#2F6E68'] as const;

/** Privacy-safe display names for memberColors, in the same order. */
export const memberColorNames = ['Green', 'Rust', 'Slate', 'Ochre', 'Plum', 'Teal'] as const;

export const shadowColor = '#14150F';

/**
 * BUILD-PROMPT.md §2 shadows, expressed as the nearest RN StyleSheet equivalent.
 * CSS: `0 1px 2px rgba(20,21,15,.05), 0 12px 30px -18px rgba(20,21,15,.22)` (card),
 * `0 10px 26px -10px rgba(20,21,15,.55), 0 2px 6px rgba(20,21,15,.14)` (fab).
 * RN supports a single shadow layer, so each is approximated as one offset/radius/opacity
 * combination that reads closest to the CSS's combined effect, plus the Android `elevation`
 * fallback (RN shadow* props are iOS-only).
 */
export const shadows = {
  card: {
    shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 3,
  },
  fab: {
    shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;
