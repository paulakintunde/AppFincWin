// Pure (no React or I/O). Port of the prototype levelFor/applyOnb (FincWin United.dc.html ~3618-3640); tax rule dropped (D-26); cut features removed (D-32).
// Answer shapes for the 11 onboarding questions (09-UI-SPEC section 2). Money is integer minor units.

export type QuestionKey =
  | 'goal'
  | 'cur'
  | 'acct'
  | 'shape'
  | 'inc'
  | 'freq'
  | 'debt'
  | 'inv'
  | 'share'
  | 'watch'
  | 'save';

/** UI-SPEC section 2 order. */
export const QUESTION_ORDER: readonly QuestionKey[] = [
  'goal',
  'cur',
  'acct',
  'shape',
  'inc',
  'freq',
  'debt',
  'inv',
  'share',
  'watch',
  'save',
];

/** The partner short version (D-30): share and cur are skipped. */
export const PARTNER_QUESTIONS: readonly QuestionKey[] = [
  'goal',
  'acct',
  'shape',
  'inc',
  'freq',
  'debt',
  'inv',
  'watch',
  'save',
];

export interface OnboardingAnswers {
  goal?: 'track' | 'stop' | 'debt' | 'save' | 'biz';
  /** ISO currency code. */
  cur?: string;
  acct?: { name: string; balanceMinor: number };
  shape?: 'steady' | 'lumpy' | 'mixed';
  inc?: { amountMinor: number };
  freq?: 'weekly' | 'fortnightly' | 'monthly' | 'irregular';
  debt?: 'none' | 'card' | 'loan' | 'several';
  inv?: 'no' | 'some' | 'lots';
  share?: 'no' | 'partner' | 'household' | 'both';
  watch?: 'closely' | 'normally' | 'lightly' | 'none';
  save?: { name: string; targetMinor: number; perMonthMinor: number };
}

/**
 * What a skipped question stands for (UI-SPEC section 2 table). Questions with no entry
 * (cur, acct, inc, save) store nothing: cur falls back to the device region currency,
 * and no account, income or goal is created.
 */
export const SKIP_DEFAULTS = {
  goal: 'track',
  shape: 'steady',
  freq: 'monthly',
  debt: 'none',
  inv: 'no',
  share: 'no',
  watch: 'normally',
} as const satisfies Partial<OnboardingAnswers>;

/** A skipped goal reads as "Keep track" but the level never drops below Everyday (D-27). */
export const SKIP_LEVEL_FLOOR = 2;
