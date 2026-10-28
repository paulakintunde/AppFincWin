/**
 * Plan 05.2-23 (DSU-04): the setup stepper shell. One place for Back / section name / Skip-or-Needed / rail / scroll
 * body / Next + Finish later. Step bodies are injected through `renderStep` (registry assembled in 05.2-32) and are
 * saved through their handle: Next saves, shows "{Step title} saved" with Undo only if something changed, and an
 * unchanged step writes nothing. Back never prompts and never loses an answer (answers are saved, or still typed in
 * the step being left, which only Next, Skip and Finish later write). Analytics carry step keys only, never amounts or
 * names.
 *
 * The shell draws each step's title from `stepTitleKey`; step bodies draw their intro, controls and "Why we ask".
 * Welcome has no body component: the shell draws it. Which step comes next is resolved against the live facts at
 * render time ("the first visible step after this one"), so an answer that adds or removes a later step (for example
 * "How are you paid?" revealing "Your regular pay") is picked up once the write lands.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { BackButton } from '@/shell/header/BackButton';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { queueToast, setToastFloor, showToast } from '@/state/undoToast';
import { DURATION, useMotion } from '@/theme/motion';
import { PRESSED_OPACITY, space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { SetupRail } from './SetupRail';
import { SETUP_STEP_KEYS, isNeeded, sectionOf, visibleSteps, type SetupFacts, type SetupSection, type SetupStepKey } from './setupFlow';
import type { SetupStepBodyProps, SetupStepHandle, SetupStepReady } from './steps/types';
import { useSetupFacts } from './useSetupFacts';

export type SetupCloseReason = 'done' | 'later' | 'notNow';

export interface SetupStepperProps {
  mode: 'full' | 'standalone';
  /** 'Finish setup' resumes at firstUnansweredNeeded. */
  startAt?: SetupStepKey;
  renderStep: (step: SetupStepKey, ref: React.Ref<SetupStepHandle>, props: SetupStepBodyProps) => React.ReactNode;
  /** i18n key of the step title, for the shell title, the toast and focus. */
  stepTitleKey: (step: SetupStepKey) => string;
  onClose: (reason: SetupCloseReason) => void;
}

type Pos = { key: SetupStepKey; after: boolean };
type Translate = (key: string, options?: Record<string, unknown>) => string;

const SECTION_KEY: Record<SetupSection, string> = {
  income: 'decide.setup.shell.sectionIncome',
  regular: 'decide.setup.shell.sectionRegular',
  spending: 'decide.setup.shell.sectionSpending',
  money: 'decide.setup.shell.sectionMoney',
  answers: 'decide.setup.shell.sectionAnswers',
};
const SECTION_ORDER: readonly SetupSection[] = ['income', 'regular', 'spending', 'money', 'answers'];
const RISE_PX = 8;

const indexOfStep = (k: SetupStepKey): number => SETUP_STEP_KEYS.indexOf(k);

/** The step the position points at: itself when visible, else the first visible step at or after it. */
function resolve(pos: Pos, order: readonly SetupStepKey[]): SetupStepKey | null {
  if (order.length === 0) return null;
  const threshold = pos.after ? indexOfStep(pos.key) + 1 : indexOfStep(pos.key);
  return order.find((k) => indexOfStep(k) >= threshold) ?? order[order.length - 1] ?? null;
}

/** fw-rise: a short rise and fade on mount (keyed per step); reduced motion passes duration 0. */
function RiseIn({ duration, children }: { duration: number; children: React.ReactNode }) {
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.value = withTiming(1, { duration, easing: Easing.bezier(0.2, 0.8, 0.3, 1) });
  }, [rise, duration]);
  const style = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ translateY: (1 - rise.value) * RISE_PX }] }));
  return <Animated.View style={[{ gap: space.gapMd }, style]}>{children}</Animated.View>;
}

export function SetupStepper(props: SetupStepperProps): React.JSX.Element {
  const facts = useSetupFacts();
  return <StepperBody {...props} facts={facts} />;
}

function StepperBody({ mode, startAt, renderStep, stepTitleKey, onClose, facts }: SetupStepperProps & { facts: SetupFacts | null }) {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const motion = useMotion();
  const rc = useRecordContext();
  const saver = useSaveSetupStep(rc.userId ?? '');
  const handle = useRef<SetupStepHandle>(null);
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  const startedFired = useRef(false);
  const [pos, setPos] = useState<Pos>({ key: startAt ?? (mode === 'full' ? 'welcome' : 'paid'), after: false });
  const [readyState, setReadyState] = useState<{ key: SetupStepKey; ready: SetupStepReady } | null>(null);

  const order = useMemo(() => (facts ? visibleSteps(facts, mode) : []), [facts, mode]);
  const step = facts ? resolve(pos, order) : null;
  const position = step === null ? -1 : order.indexOf(step);
  const isLast = position >= 0 && position === order.length - 1;
  const nextStep = position >= 0 ? (order[position + 1] ?? null) : null;
  const needed = facts !== null && step !== null && step !== 'welcome' && isNeeded(step, facts);
  const isWelcome = step === 'welcome';
  const isSummary = step === 'summary';

  // decide_setup_started: once per mount session.
  useEffect(() => {
    if (startedFired.current) return;
    startedFired.current = true;
    getAnalytics().track('decide_setup_started', {});
  }, []);

  // The toast floats above the footer, never over Next.
  const [footerHeight, setFooterHeight] = useState(0);
  useEffect(() => {
    setToastFloor(footerHeight > 0 ? footerHeight + space.gapMd : null);
    return () => setToastFloor(null);
  }, [footerHeight]);

  // Focus the step title and rise the content on each step change.
  useEffect(() => {
    if (step === null) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
        if (live && on && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [step]);

  const ready: SetupStepReady | null = readyState !== null && readyState.key === step ? readyState.ready : null;
  const canContinue = isWelcome || isSummary || (ready !== null ? ready.canContinue : !needed);
  const reasonKey = needed && ready !== null && !ready.canContinue ? ready.reasonKey : null;
  const reason = reasonKey !== null ? t(reasonKey) : null;

  const onReadyChange = useCallback(
    (r: SetupStepReady) => {
      if (step !== null) setReadyState({ key: step, ready: r });
    },
    [step],
  );

  /** Saves the current step through its handle; toast and analytics only when it wrote something. */
  const saveCurrent = useCallback((): boolean => {
    if (step === null || step === 'welcome') return false;
    const result = handle.current?.save() ?? { stepId: null };
    if (result.stepId === null) return false;
    const title = t(stepTitleKey(step));
    showToast({ kind: 'ordinary', text: { key: 'decide.setup.shell.toastSaved', params: { title, name: title } }, stepId: result.stepId });
    getAnalytics().track('decide_setup_step_saved', { step });
    return true;
  }, [step, stepTitleKey, t]);

  const goBack = useCallback(() => {
    if (step === null || position <= 0) {
      onClose('notNow');
      return;
    }
    const prev = order[position - 1];
    if (prev !== undefined) setPos({ key: prev, after: false });
  }, [step, position, order, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  const finish = () => {
    if (mode === 'full' && facts !== null && facts.setupDoneAt === null && rc.userId !== null) {
      saver.save({ patch: { setup_done_at: new Date().toISOString() } });
    }
    getAnalytics().track('decide_setup_finished', {});
    onClose('done');
  };

  const advance = () => {
    if (step === null) return;
    if (isLast) {
      finish();
      return;
    }
    setPos({ key: step, after: true });
  };

  const onNext = () => {
    if (step === null || !canContinue) return;
    saveCurrent();
    advance();
  };

  const onSkip = () => {
    if (step === null) return;
    if (ready !== null && ready.dirty && ready.canContinue) saveCurrent();
    advance();
  };

  const onFinishLater = () => {
    if (step === null) return;
    if (isWelcome) {
      onClose('notNow');
      return;
    }
    const saved = canContinue ? saveCurrent() : false;
    getAnalytics().track('decide_setup_left', { step });
    const later = { kind: 'ordinary' as const, text: { key: 'decide.setup.shell.toastLater' } };
    if (saved) queueToast(later);
    else showToast(later);
    onClose('later');
  };

  const section = step === null ? null : sectionOf(step);
  const sectionNumber = section === null ? 0 : SECTION_ORDER.indexOf(section) + 1;
  const sectionName = mode === 'standalone' ? t('decide.setup.shell.standaloneSection') : section === null ? '' : t(SECTION_KEY[section]);
  const headerLabel = mode === 'standalone' ? sectionName : section === null ? '' : t('decide.setup.shell.railA11y', { n: sectionNumber, name: sectionName });

  const nextLabel = isWelcome
    ? t('decide.setup.shell.start')
    : isLast
      ? t('decide.setup.shell.done')
      : mode === 'full' && nextStep === 'summary'
        ? t('decide.setup.shell.finishSetup')
        : t('decide.setup.shell.next');

  const bodyProps: SetupStepBodyProps = { mode: mode === 'standalone' ? 'standalone' : 'stepper', onReadyChange };
  const title = step === null ? '' : isWelcome ? t('decide.setup.welcome.title') : t(stepTitleKey(step));

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton variant="detail" onPress={goBack} />
        <Text
          accessibilityLabel={headerLabel === '' ? undefined : headerLabel}
          style={[styles.sectionName, { ...textRole(pairing, 'label'), color: colors.inkDim }]}
        >
          {sectionName}
        </Text>
        <View style={styles.rightSlot}>
          {isWelcome || isSummary || step === null ? null : needed ? (
            <Text accessibilityLabel={t('decide.setup.shell.neededA11y')} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {t('decide.setup.shell.needed')}
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('decide.setup.shell.skip')}
              onPress={onSkip}
              hitSlop={space.gapSm}
              style={({ pressed }) => [styles.skip, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{t('decide.setup.shell.skip')}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <View style={styles.railWrap}>
        <SetupRail current={section} hidden={mode === 'standalone'} />
      </View>
      <SyncProblemLine />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {step === null ? null : (
          <RiseIn key={step} duration={motion.duration(DURATION.entrance)}>
            <Text
              ref={titleRef}
              accessibilityRole="header"
              style={{ ...textRole(pairing, isWelcome ? 'display' : 'heading'), color: colors.ink }}
            >
              {title}
            </Text>
            {isWelcome ? (
              <View style={{ gap: space.gapMd }}>
                <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.setup.welcome.body')}</Text>
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkMuted }}>{t('decide.setup.welcome.meta')}</Text>
              </View>
            ) : (
              <React.Fragment key={step}>{renderStep(step, handle, bodyProps)}</React.Fragment>
            )}
          </RiseIn>
        )}
      </ScrollView>
      <View
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        style={[styles.footer, { borderTopColor: colors.line1, backgroundColor: colors.canvas, paddingBottom: insets.bottom }]}
      >
        {reason !== null ? (
          <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {reason}
          </Text>
        ) : null}
        <Pill
          label={nextLabel}
          variant="primary"
          disabled={!canContinue}
          onPress={onNext}
          accessibilityHint={reason ?? undefined}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isWelcome ? t('decide.setup.shell.notNow') : t('decide.setup.shell.finishLater')}
          onPress={onFinishLater}
          style={({ pressed }) => [styles.later, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
            {isWelcome ? t('decide.setup.shell.notNow') : t('decide.setup.shell.finishLater')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingHorizontal: space.screenH, paddingVertical: space.gapSm },
  sectionName: { flex: 1, textAlign: 'center' },
  rightSlot: { minWidth: space.touchMin, alignItems: 'flex-end', justifyContent: 'center' },
  skip: { minHeight: space.touchMin, justifyContent: 'center' },
  railWrap: { paddingHorizontal: space.screenH, paddingBottom: space.gapMd },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space.screenH, paddingTop: space.groupGap, paddingBottom: space.groupGap },
  footer: { paddingHorizontal: space.screenH, paddingTop: space.gapMd, gap: space.gapSm, borderTopWidth: 1 },
  later: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
