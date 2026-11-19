// 09-21: the onboarding question flow. Renders the current step (a question, the unnumbered analytics step, or the summary)
// in one of three modes: first_run, partner (9 questions, private) and rerun ("Keep what I have" changes nothing).
// Routing and first-run wiring are 09-23: it passes `onFinished`, `onExitFirst`, `payerName` and the Features route.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { currencyForRegion } from '@/engine/money/regionCurrency';
import { useAuth } from '@/features/auth/AuthProvider';
import { ConsentContent } from '@/features/consent/ConsentScreen';
import type { SetupStepReady } from '@/features/income/stepTypes';
import type { Level } from '@/features/levels/featureRegistry';
import type { OnboardingAnswers, QuestionKey } from '@/features/levels/onboardingAnswers';
import { featuresPreviewHref } from '@/features/plans/routes';
import { getDeviceRegion } from '@/services/locale/deviceLocale';
import { showToast } from '@/state/undoToast';
import { Screen } from '@/ui/Screen';
import { AccountQuestion, type AccountValue } from './questions/AccountQuestion';
import { CurrencyQuestion } from './questions/CurrencyQuestion';
import { IncomeQuestion, type IncomeQuestionHandle, type IncomeQuestionKey } from './questions/IncomeQuestion';
import { OptionQuestion } from './questions/OptionQuestion';
import { isOptionQuestion } from './questions/optionTables';
import { SaveGoalQuestion, type SaveGoalValue } from './questions/SaveGoalQuestion';
import { QuestionScreen } from './QuestionScreen';
import { SummaryScreen } from './SummaryScreen';
import { useCopy } from './useCopy';
import { useOnboardingFlow, type OnboardingMode } from './useOnboardingFlow';

export interface OnboardingFlowProps {
  mode: OnboardingMode;
  /** `{ level }` after Continue / Apply these; null after "Keep what I have". */
  onFinished: (result: { level: Level } | null) => void;
  /** Back on question 1: Welcome on first run, otherwise the previous screen. Return true when handled. */
  onExitFirst?: () => boolean | void;
  /** Partner version: the name of whoever pays for the household, for the privacy line. */
  payerName?: string;
}

const INCOME_KEYS: readonly QuestionKey[] = ['shape', 'inc', 'freq'];
const INCOME_TITLE_KEY: Record<IncomeQuestionKey, string> = {
  shape: 'income.paid.title',
  inc: 'income.pay.title',
  freq: 'income.season.title',
};

type Draft = OnboardingAnswers[QuestionKey] | undefined;

export function OnboardingFlow({ mode, onFinished, onExitFirst, payerName }: OnboardingFlowProps) {
  const t = useCopy();
  const router = useRouter();
  const flow = useOnboardingFlow({ mode });
  const { user } = useAuth();
  const { prefs } = useMoneyPrefs(user?.id);
  const incomeRef = useRef<IncomeQuestionHandle>(null);
  const [incomeReady, setIncomeReady] = useState<{ step: string; ready: boolean }>({ step: '', ready: false });
  const [draftState, setDraftState] = useState<{ step: string; value: Draft } | null>(null);

  // Partner version abandoned part-way: Everyday, no notice.
  const abandonRef = useRef(flow.abandon);
  useEffect(() => {
    abandonRef.current = flow.abandon;
  });
  useEffect(() => () => abandonRef.current(), []);

  // Android back: one question at a time; on question 1 the host decides.
  const { step, canGoBack, back } = flow;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        back();
        return true;
      }
      return onExitFirst?.() === true;
    });
    return () => sub.remove();
  }, [canGoBack, back, onExitFirst]);

  const onReadyChange = useCallback(
    (ready: SetupStepReady) => setIncomeReady({ step, ready: ready.canContinue }),
    [step]
  );

  if (!flow.ready) return <Screen>{null}</Screen>;

  const keep = () => {
    const { toastKey } = flow.keepWhatIHave();
    showToast({ kind: 'ordinary', text: { key: toastKey } });
    onFinished(null);
  };
  const finish = () => onFinished(flow.apply());

  if (step === 'analytics') {
    return (
      <Screen scroll>
        <ConsentContent lastStep onDone={flow.analyticsDone} />
      </Screen>
    );
  }

  if (step === 'summary') {
    const plan = flow.preview();
    return (
      <SummaryScreen
        mode={mode}
        answers={flow.answers}
        level={plan.level}
        switches={plan.switches}
        homeCurrency={flow.homeCurrency}
        onContinue={finish}
        onApply={finish}
        onKeep={keep}
        onSeeWhatIsOn={() => router.push(featuresPreviewHref(plan.level, plan.switches))}
      />
    );
  }

  const key: QuestionKey = step;
  const progress = flow.progress as { n: number; total: number };
  const currency = flow.answers.cur ?? flow.homeCurrency;
  const deviceCurrency = currencyForRegion(getDeviceRegion(prefs.region)) ?? flow.homeCurrency;
  const initial: Draft = key === 'cur' ? (flow.answers.cur ?? (mode === 'rerun' ? flow.homeCurrency : deviceCurrency)) : flow.answers[key];
  const draft: Draft = draftState?.step === key ? draftState.value : initial;
  const setDraft = (value: Draft) => setDraftState({ step: key, value });

  const isIncome = INCOME_KEYS.includes(key);
  const incomeDone = incomeReady.step === key && incomeReady.ready;
  const canContinue = isIncome ? incomeDone : key === 'cur' || draft !== undefined;

  const onContinue = () => {
    if (isIncome) {
      flow.answer(key, incomeRef.current?.commit());
      return;
    }
    flow.answer(key, draft);
  };

  const title = isIncome ? t(INCOME_TITLE_KEY[key as IncomeQuestionKey]) : t(`onboarding.q.${key}.title`);
  const sub = isIncome ? undefined : t(`onboarding.q.${key}.sub`);
  const why = isIncome ? undefined : t(`onboarding.q.${key}.why`);

  let body: React.ReactNode = null;
  if (isOptionQuestion(key)) {
    body = <OptionQuestion question={key} value={draft as string | undefined} onChange={(v) => setDraft(v as Draft)} />;
  } else if (key === 'cur') {
    body = (
      <CurrencyQuestion
        userId={user?.id}
        value={draft as string}
        homeCurrency={flow.homeCurrency}
        onChange={(code) => setDraft(code)}
      />
    );
  } else if (key === 'acct') {
    body = <AccountQuestion currency={currency} value={draft as AccountValue | undefined} onChange={(v) => setDraft(v)} />;
  } else if (key === 'save') {
    body = <SaveGoalQuestion currency={currency} value={draft as SaveGoalValue | undefined} onChange={(v) => setDraft(v)} />;
  } else if (isIncome) {
    body = <IncomeQuestion ref={incomeRef} question={key as IncomeQuestionKey} onReadyChange={onReadyChange} />;
  }

  return (
    <QuestionScreen
      stepKey={key}
      progress={progress}
      title={title}
      {...(sub !== undefined ? { sub } : {})}
      {...(why !== undefined ? { why } : {})}
      partner={mode === 'partner'}
      {...(payerName !== undefined ? { payerName } : {})}
      canGoBack={canGoBack}
      canContinue={canContinue}
      onBack={flow.back}
      onContinue={onContinue}
      onSkip={() => flow.skip(key)}
      onSkipRest={flow.skipRest}
      {...(mode === 'rerun' ? { onKeep: keep } : {})}
    >
      {body}
    </QuestionScreen>
  );
}
