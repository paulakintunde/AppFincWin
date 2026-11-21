// 09-21: the option rows for the five choice questions (goal, debt, inv, share, watch). Values are the stored answer
// keys from onboardingAnswers.ts; the copy keys follow the signed wording rows (09-WORDING.md onboarding.q.*).
import type { OnboardingAnswers, QuestionKey } from '@/features/levels/onboardingAnswers';

export interface OptionDef {
  value: string;
  titleKey: string;
  subKey?: string;
}

export type OptionQuestionKey = 'goal' | 'debt' | 'inv' | 'share' | 'watch';

const q = (key: string, name: string) => `onboarding.q.${key}.options.${name}`;

export const OPTION_TABLE: Record<OptionQuestionKey, readonly OptionDef[]> = {
  goal: [
    { value: 'track', titleKey: q('goal', 'track'), subKey: q('goal', 'trackSub') },
    { value: 'stop', titleKey: q('goal', 'stop'), subKey: q('goal', 'stopSub') },
    { value: 'debt', titleKey: q('goal', 'debt'), subKey: q('goal', 'debtSub') },
    { value: 'save', titleKey: q('goal', 'save'), subKey: q('goal', 'saveSub') },
    { value: 'biz', titleKey: q('goal', 'biz'), subKey: q('goal', 'bizSub') },
  ],
  debt: [
    { value: 'none', titleKey: q('debt', 'no') },
    { value: 'card', titleKey: q('debt', 'card'), subKey: q('debt', 'cardSub') },
    { value: 'loan', titleKey: q('debt', 'loan'), subKey: q('debt', 'loanSub') },
    { value: 'several', titleKey: q('debt', 'both'), subKey: q('debt', 'bothSub') },
  ],
  inv: [
    { value: 'no', titleKey: q('inv', 'no') },
    { value: 'some', titleKey: q('inv', 'some'), subKey: q('inv', 'someSub') },
    { value: 'lots', titleKey: q('inv', 'lots'), subKey: q('inv', 'lotsSub') },
  ],
  share: [
    { value: 'no', titleKey: q('share', 'no') },
    { value: 'partner', titleKey: q('share', 'partner') },
    { value: 'household', titleKey: q('share', 'house'), subKey: q('share', 'houseSub') },
    { value: 'both', titleKey: q('share', 'both'), subKey: q('share', 'bothSub') },
  ],
  watch: [
    { value: 'lightly', titleKey: q('watch', 'light'), subKey: q('watch', 'lightSub') },
    { value: 'normally', titleKey: q('watch', 'normal'), subKey: q('watch', 'normalSub') },
    { value: 'closely', titleKey: q('watch', 'close'), subKey: q('watch', 'closeSub') },
    { value: 'none', titleKey: q('watch', 'none'), subKey: q('watch', 'noneSub') },
  ],
};

export function isOptionQuestion(key: QuestionKey): key is OptionQuestionKey {
  return key in OPTION_TABLE;
}

/** The copy key of the title for a stored option answer, for the summary rows. */
export function optionTitleKey(key: OptionQuestionKey, answers: OnboardingAnswers): string | null {
  const value = answers[key];
  return OPTION_TABLE[key].find((o) => o.value === value)?.titleKey ?? null;
}
