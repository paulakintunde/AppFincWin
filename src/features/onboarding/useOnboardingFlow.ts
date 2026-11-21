// 09-21: the onboarding step machine. Pure helpers (stepsFor, progressOf, buildApply) are exported for tests; the hook wires
// them to the person's private user_setup row (09-13), the level logic (09-11) and the consent-gated analytics (09-12).
// D-26/D-27: every question is skippable; D-30: the partner version is 9 questions; D-31: re-run changes nothing until Apply.
// Owner P3: no account, goal or income record is created here; answers wait in user_setup.answers (09-23 applies them).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDecideSettings } from '@/data/queries/decide';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useUpdateMoneyPrefs } from '@/data/mutations/moneyPrefs';
import { useReplaceFeatureSwitches, useSaveUserSetup } from '@/data/mutations/userSetup';
import { useAuth } from '@/features/auth/AuthProvider';
import { useConsent } from '@/features/consent/useConsent';
import { FEATURES, type Level } from '@/features/levels/featureRegistry';
import { applyOnb } from '@/features/levels/applyOnb';
import { levelFor } from '@/features/levels/levelFor';
import { PARTNER_QUESTIONS, QUESTION_ORDER, type OnboardingAnswers, type QuestionKey } from '@/features/levels/onboardingAnswers';
import { useHoldsData, type HoldsDataProbeId } from '@/features/levels/useHoldsData';
import { useUserSetup } from '@/features/levels/useUserSetup';
import { getAnalytics } from '@/services/analytics';
import { deriveIncomeShape } from './deriveIncomeShape';

export type OnboardingMode = 'first_run' | 'partner' | 'rerun';
export type FlowStep = QuestionKey | 'analytics' | 'summary';

/** The ordered steps. The analytics step is only for first run and partner, and only while consent is unanswered. */
export function stepsFor(mode: OnboardingMode, consentUnanswered = true): FlowStep[] {
  const questions = mode === 'partner' ? PARTNER_QUESTIONS : QUESTION_ORDER;
  const steps: FlowStep[] = [...questions];
  if (mode !== 'rerun' && consentUnanswered) steps.push('analytics');
  steps.push('summary');
  return steps;
}

export function questionCount(mode: OnboardingMode): number {
  return mode === 'partner' ? PARTNER_QUESTIONS.length : QUESTION_ORDER.length;
}

/** "3 of 11". The analytics step and the summary are not counted. Null when the step is not a question. */
export function progressOf(mode: OnboardingMode, step: FlowStep): { n: number; total: number } | null {
  const questions: readonly FlowStep[] = mode === 'partner' ? PARTNER_QUESTIONS : QUESTION_ORDER;
  const at = questions.indexOf(step);
  return at < 0 ? null : { n: at + 1, total: questions.length };
}

export function hasAnyAnswer(answers: OnboardingAnswers): boolean {
  return (Object.keys(answers) as (keyof OnboardingAnswers)[]).some((k) => answers[k] !== undefined);
}

export interface ApplyPlan {
  level: Level;
  source: 'answers' | 'skipped';
  allSkipped: boolean;
  /** Feature id to on/off for the replace-all write. */
  switches: Record<string, boolean>;
}

/** Answers to level and switches. Pure. Features that hold records stay on in a re-run even if the new level drops them. */
export function buildApply(input: {
  mode: OnboardingMode;
  answers: OnboardingAnswers;
  homeCurrency: string;
  holdsData?: Readonly<Partial<Record<HoldsDataProbeId, boolean>>>;
}): ApplyPlan {
  const allSkipped = !hasAnyAnswer(input.answers);
  const level = levelFor(input.answers);
  const switches: Record<string, boolean> = { ...applyOnb(input.answers, level, { homeCurrency: input.homeCurrency }) };
  if (input.mode === 'rerun' && input.holdsData !== undefined) {
    for (const f of FEATURES) {
      if (f.minLevel > level && f.holdsData !== null && input.holdsData[f.holdsData as HoldsDataProbeId] === true) {
        switches[f.id] = true;
      }
    }
  }
  return { level, source: allSkipped ? 'skipped' : 'answers', allSkipped, switches };
}

const asLevelString = (l: number): '1' | '2' | '3' | '4' => String(l) as '1' | '2' | '3' | '4';

export interface OnboardingFlow {
  ready: boolean;
  mode: OnboardingMode;
  steps: FlowStep[];
  step: FlowStep;
  progress: { n: number; total: number } | null;
  answers: OnboardingAnswers;
  homeCurrency: string;
  canGoBack: boolean;
  /** Record an answer (undefined = skipped, nothing stored), save it and move on. */
  answer(key: QuestionKey, value: OnboardingAnswers[QuestionKey] | undefined): void;
  skip(key: QuestionKey): void;
  skipRest(): void;
  back(): void;
  analyticsDone(): void;
  /** Level and switches the summary would apply, for its level card. */
  preview(): ApplyPlan;
  apply(): { level: Level };
  /** Re-run "Keep what I have": writes nothing. */
  keepWhatIHave(): { toastKey: 'onboarding.rerun.keepToast' };
  /** Partner version quit part-way: the level is Everyday with no notice. Safe to call more than once. */
  abandon(): void;
}

export function useOnboardingFlow({ mode }: { mode: OnboardingMode }): OnboardingFlow {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { data: setup, loading } = useUserSetup();
  const { saveUserSetup } = useSaveUserSetup();
  const { replaceFeatureSwitches } = useReplaceFeatureSwitches();
  const consent = useConsent();
  const holdsData = useHoldsData();
  const { prefs } = useMoneyPrefs(userId || undefined);
  const { setHomeCurrency } = useUpdateMoneyPrefs(userId);
  const settings = useDecideSettings(userId || undefined).data ?? null;

  // The analytics step shows if consent was unanswered once it loaded; answering it mid-flow does not remove it.
  const [analyticsOn, setAnalyticsOn] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latches once consent is known to be unanswered, so answering it mid-flow does not drop the step
    if (mode !== 'rerun' && !consent.loading && consent.consent === null) setAnalyticsOn(true);
  }, [mode, consent.loading, consent.consent]);
  const steps = useMemo(() => stepsFor(mode, analyticsOn), [mode, analyticsOn]);

  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [step, setStep] = useState<FlowStep>(steps[0] as FlowStep);
  const [started, setStarted] = useState(false);
  const finished = useRef(false);
  const latest = useRef({ setup, answers, userId });
  useEffect(() => {
    latest.current = { setup, answers, userId };
  });

  // Resume: answers and place come from the saved row once it has loaded (re-run pre-fills the last run's answers only).
  useEffect(() => {
    if (started || loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydrate from the saved setup row once it has loaded
    setStarted(true);
    const saved = setup?.answers ?? {};
    setAnswers(saved);
    if (mode !== 'rerun' && setup?.resumeStep && (steps as string[]).includes(setup.resumeStep)) {
      setStep(setup.resumeStep as FlowStep);
    }
    getAnalytics().track('onboarding_started', { mode });
  }, [started, loading, setup, mode, steps]);

  const persist = useCallback(
    (next: OnboardingAnswers, resumeStep: FlowStep) => {
      if (mode === 'rerun' || latest.current.userId === '') return;
      saveUserSetup({
        userId: latest.current.userId,
        patch: { answers: next, resumeStep, ...(mode === 'partner' ? { partnerVersion: true } : {}) },
        baseVersion: latest.current.setup?.version ?? 0,
      });
    },
    [mode, saveUserSetup]
  );

  const nextOf = useCallback(
    (from: FlowStep): FlowStep => steps[Math.min(steps.length - 1, steps.indexOf(from) + 1)] as FlowStep,
    [steps]
  );

  const answer = useCallback(
    (key: QuestionKey, value: OnboardingAnswers[QuestionKey] | undefined) => {
      const next: OnboardingAnswers = { ...latest.current.answers };
      if (value === undefined) delete next[key];
      else (next as Record<string, unknown>)[key] = value;
      const to = nextOf(key);
      setAnswers(next);
      persist(next, to);
      getAnalytics().track('onboarding_question_answered', { step: key, skipped: value === undefined });
      setStep(to);
    },
    [nextOf, persist]
  );

  const skip = useCallback((key: QuestionKey) => answer(key, undefined), [answer]);

  const skipRest = useCallback(() => {
    // Everything unanswered stays unanswered; jump to the analytics step (if shown) then the summary.
    const to = steps[steps.length - (steps.includes('analytics') ? 2 : 1)] as FlowStep;
    persist(latest.current.answers, to);
    setStep(to);
  }, [steps, persist]);

  const back = useCallback(() => {
    const at = steps.indexOf(step);
    if (at > 0) setStep(steps[at - 1] as FlowStep);
  }, [steps, step]);

  const analyticsDone = useCallback(() => {
    persist(latest.current.answers, 'summary');
    setStep('summary');
  }, [persist]);

  const homeCurrency = prefs.home_currency;

  const finalAnswers = useCallback((): OnboardingAnswers => {
    const a: OnboardingAnswers = { ...latest.current.answers };
    // Q4/Q6 saved through the shared income steps; the saved profile decides the shape.
    if (a.shape !== undefined) a.shape = deriveIncomeShape(settings?.income_types, settings?.income_pattern);
    return a;
  }, [settings]);

  const planFor = useCallback(
    (a: OnboardingAnswers): ApplyPlan =>
      buildApply({
        mode,
        answers: a,
        homeCurrency: mode === 'rerun' ? homeCurrency : (a.cur ?? homeCurrency),
        holdsData,
      }),
    [mode, homeCurrency, holdsData]
  );

  const preview = useCallback(() => planFor(finalAnswers()), [planFor, finalAnswers]);

  const apply = useCallback((): { level: Level } => {
    const a = finalAnswers();
    const plan = planFor(a);
    const { setup: current, userId: uid } = latest.current;
    finished.current = true;
    replaceFeatureSwitches({ userId: uid, map: plan.switches });
    saveUserSetup({
      userId: uid,
      patch: {
        level: plan.level,
        levelSource: plan.source,
        answers: a,
        completedAt: new Date().toISOString(),
        resumeStep: null,
        ...(mode === 'partner' ? { partnerVersion: true } : {}),
      },
      baseVersion: current?.version ?? 0,
    });
    // Q2 writes the person's home currency on Continue. A re-run never changes it (rewriting caps is a separate action).
    if (mode !== 'rerun' && a.cur !== undefined && a.cur !== homeCurrency) setHomeCurrency(a.cur);
    const analytics = getAnalytics();
    analytics.track('onboarding_level_assigned', { level: asLevelString(plan.level), source: plan.source });
    analytics.track('onboarding_finished', { mode, skipped_all: plan.allSkipped });
    if (mode === 'rerun' && current?.level != null && current.level !== plan.level) {
      analytics.track('level_changed', { from: asLevelString(current.level), to: asLevelString(plan.level), source: 'rerun' });
    }
    return { level: plan.level };
  }, [finalAnswers, planFor, replaceFeatureSwitches, saveUserSetup, mode, homeCurrency, setHomeCurrency]);

  const keepWhatIHave = useCallback((): { toastKey: 'onboarding.rerun.keepToast' } => {
    finished.current = true;
    return { toastKey: 'onboarding.rerun.keepToast' };
  }, []);

  const abandon = useCallback(() => {
    const { setup: current, userId: uid } = latest.current;
    if (mode !== 'partner' || finished.current || uid === '' || current?.level != null) return;
    finished.current = true;
    saveUserSetup({
      userId: uid,
      patch: { level: 2, levelSource: 'skipped', partnerVersion: true },
      baseVersion: current?.version ?? 0,
    });
  }, [mode, saveUserSetup]);

  return {
    ready: started,
    mode,
    steps,
    step,
    progress: progressOf(mode, step),
    answers,
    homeCurrency,
    canGoBack: steps.indexOf(step) > 0,
    answer,
    skip,
    skipRest,
    back,
    analyticsDone,
    preview,
    apply,
    keepWhatIHave,
    abandon,
  };
}

/** Count of features on at a level, with overrides applied, for the summary level card. */
export function featuresOn(level: Level, overrides: Readonly<Record<string, boolean>>): number {
  return FEATURES.filter((f) => {
    const o = overrides[f.id];
    return o ?? f.minLevel <= level;
  }).length;
}
