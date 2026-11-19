// 09-14 (UI-SPEC section 5): the Plans screen, the paywall. Every rule lives in plansModel; every word is a plans.paywall.* key;
// every price is a store string. The lock lifts only when the server says covered (usePurchaseFlow waits for plan_state).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tOneOf } from '@/i18n';
import { APP_HOME_HREF } from '@/features/auth/appHome';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { BackButton } from '@/shell/header/BackButton';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { metaRole } from './components/metaRole';
import { useTheme } from '@/theme/ThemeProvider';
import { hapticTap } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { RiseIn } from '@/ui/RiseIn';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { ToastView } from '@/ui/ToastView';
import { WarningCard } from '@/ui/WarningCard';
import { captureError } from '@/services/errors';
import { PlanCard } from './components/PlanCard';
import { PeriodToggle } from './components/PeriodToggle';
import { DisclosureBlock } from './components/DisclosureBlock';
import { formatPlanDate } from './formatPlanDate';
import { heldPlan, plansModel, type PlansMode } from './plansModel';
import { loadOffers } from './store/purchasesClient';
import { changeRule } from './store/catalog';
import { usePlanState } from './usePlanState';
import { usePurchaseFlow, type RestoreToastKey } from './usePurchaseFlow';
import type { PlanKey, PlanOffer, PlanPeriod } from './types';

const TOAST_MS = 4000;
const MODES: readonly PlansMode[] = ['first_run', 'change', 'locked'];
const PLAN_KEYS_SET: readonly string[] = ['solo', 'duo', 'household', 'extended'];

export interface PlansScreenProps {
  mode?: string;
  plan?: string;
  /** Opens the household members screen ("See members"). Injected so this screen does not import Phase 8 routes. */
  onSeeMembers?: () => void;
}

export function PlansScreen({ mode: modeParam, plan: planParam, onSeeMembers }: PlansScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors, pairing } = useTheme();
  const router = useRouter();
  const { goBack } = useBackHistory();
  const plan = usePlanState();
  const flow = usePurchaseFlow();

  const mode: PlansMode = MODES.includes(modeParam as PlansMode) ? (modeParam as PlansMode) : plan.status === 'locked' ? 'locked' : 'change';
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  const [result, setResult] = useState<{ key: string; offers: PlanOffer[] | null; error: boolean }>({ key: '', offers: null, error: false });
  const [now] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState<PlanPeriod>('year'); // Yearly on open (owner answer Q1)
  const [selPlan, setSelPlan] = useState<PlanKey | null>(PLAN_KEYS_SET.includes(planParam ?? '') ? (planParam as PlanKey) : null);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<RestoreToastKey | null>(null);
  const trialAvailable = plan.trialAvailable;

  // Prices are asked of the store every time the screen opens and are never remembered (T-09-53).
  const askKey = `${platform}|${trialAvailable}|${attempt}`;
  useEffect(() => {
    let live = true;
    loadOffers({ platform, trialAvailable })
      .then((list) => {
        if (live) setResult({ key: askKey, offers: list, error: false });
      })
      .catch((e: unknown) => {
        captureError(e, { area: 'unknown' });
        if (live) setResult({ key: askKey, offers: null, error: true });
      });
    return () => {
      live = false;
    };
  }, [platform, trialAvailable, askKey]);
  // An answer for an older question (another attempt) counts as still loading.
  const offers = result.key === askKey ? result.offers : null;
  const offersError = result.key === askKey && result.error;


  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const model = useMemo(
    () => plansModel({ plan, offers, offersError, mode, selected: { plan: selPlan, period }, platform, now }),
    [plan, offers, offersError, mode, selPlan, period, platform, now],
  );

  useEffect(() => {
    if (flow.state !== 'done') return;
    if (mode === 'first_run') router.replace(APP_HOME_HREF);
    else goBack();
  }, [flow.state, mode, router, goBack]);

  const buy = useCallback(() => {
    const offer = model.cta.offer;
    if (!offer) return;
    hapticTap();
    setConfirming(false);
    const held = heldPlan(plan);
    // Android replacement mode needs the product being replaced; the iPhone store resolves it from its groups.
    const googleMode = model.cta.googleMode;
    const change = held && platform === 'android' && plan.productId && googleMode ? { fromProductId: plan.productId, googleMode } : undefined;
    void flow.start({ offer, ...(change ? { change } : {}), timing: model.cta.timing ?? 'now' });
  }, [flow, model.cta, plan, platform]);

  const onCta = useCallback(() => {
    if (model.cta.requiresConfirm) setConfirming(true);
    else buy();
  }, [model.cta.requiresConfirm, buy]);

  const onRestore = useCallback(async () => {
    const key = await flow.restore();
    if (key) setToast(key);
  }, [flow]);

  const busy = flow.state === 'pending';
  const waiting = flow.state === 'waitingServer' || flow.state === 'slow' || flow.state === 'done';
  const loading = model.state === 'loading';
  const ctaPlanName = t(`plans.paywall.cards.${model.selection.plan}.name`);
  const ctaLabel = tOneOf(t, model.cta.labelKey, model.cta.params.plan ? { plan: ctaPlanName } : undefined);
  const body = { ...textRole(pairing, 'body'), color: colors.inkDim };
  const link = { ...textRole(pairing, 'label'), color: colors.accent };

  // The held-plan change line on the confirm sheet: now, or at the next renewal on a date. Same rule the cards use.
  const confirmBody = (() => {
    const held = heldPlan(plan);
    if (!held) return '';
    const rule = changeRule({ from: { ...held, billingIssue: false }, to: { plan: model.selection.plan, period }, platform });
    if ('timing' in rule && rule.timing === 'renewal') return t('plans.paywall.changeConfirm.renewal', { date: formatPlanDate(plan.coveredUntil, i18n.language) });
    return t('plans.paywall.changeConfirm.now');
  })();

  return (
    <Screen>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} pointerEvents={busy ? 'none' : 'auto'}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t(model.heading)}
        </Text>
        <Text style={body}>{t(model.startLine)}</Text>

        {waiting ? (
          <View testID="plans-waiting" style={[styles.notice, { backgroundColor: colors.fill1 }]}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
              {flow.state === 'slow' ? t('plans.paywall.states.slow') : t('plans.paywall.states.updating')}
            </Text>
          </View>
        ) : null}

        {model.state === 'storeError' ? (
          <View style={styles.group}>
            <WarningCard tone="soft" title={t('plans.paywall.states.loadFailed')} value="" body={[]} />
            <Pressable accessibilityRole="link" hitSlop={LINK_HIT_SLOP} style={styles.link} onPress={() => setAttempt((n) => n + 1)}>
              <Text style={link}>{t('plans.paywall.states.tryAgain')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {model.showTrialUsed ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('plans.paywall.trialUsed')}</Text> : null}
            <PeriodToggle value={period} onChange={setPeriod} />
            <RiseIn key={loading ? 'loading' : 'ready'} style={styles.group}>
              {model.cards.map((card) => (
                <PlanCard key={card.planKey} card={card} loading={loading} onPress={() => setSelPlan(card.planKey)} />
              ))}
            </RiseIn>
            {model.hiddenPlansCount !== null ? (
              <View style={styles.hidden}>
                <Text style={{ ...metaRole(pairing), color: colors.inkMuted }}>{t('plans.paywall.hiddenPlans', { count: model.hiddenPlansCount })}</Text>
                <Pressable accessibilityRole="link" hitSlop={LINK_HIT_SLOP} style={styles.link} onPress={onSeeMembers}>
                  <Text style={link}>{t('plans.paywall.hiddenPlansLink')}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}

        {flow.state === 'failed' ? (
          <WarningCard
            tone="soft"
            title={t('plans.paywall.states.failed')}
            value=""
            body={[flow.notCharged ? t('plans.paywall.states.notCharged') : t('plans.paywall.states.storeProblem')]}
          />
        ) : null}
        {model.blocked ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('plans.paywall.fixPaymentFirst')}</Text> : null}

        {model.state === 'storeError' ? null : <DisclosureBlock lines={model.disclosure} />}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.canvas }]}>
        <Pill
          variant="primary"
          label={ctaLabel}
          disabled={model.cta.disabled || waiting}
          pending={busy}
          onPress={onCta}
        />
        <Pressable accessibilityRole="link" hitSlop={LINK_HIT_SLOP} style={styles.link} onPress={() => void onRestore()}>
          <Text style={link}>{t('plans.paywall.restore')}</Text>
        </Pressable>
      </View>

      <ConfirmSheet
        visible={confirming}
        title={ctaLabel}
        body={confirmBody}
        cancelLabel={t('plans.paywall.changeConfirm.keep')}
        confirmLabel={ctaLabel}
        onConfirm={buy}
        onCancel={() => setConfirming(false)}
      />
      {toast ? (
        <View style={styles.toast}>
          <ToastView message={tOneOf(t, toast)} dismissLabel={t('a11y.dismiss')} onDismiss={() => setToast(null)} />
        </View>
      ) : null}
    </Screen>
  );
}


const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd, alignItems: 'flex-start' },
  scroll: { flex: 1 },
  content: { gap: space.groupGap, paddingBottom: space.groupGap },
  group: { gap: space.gapMd },
  hidden: { gap: space.gapSm },
  notice: { borderRadius: radii.card, padding: space.cardPad },
  link: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: space.gapSm, paddingTop: space.cardPad },
  toast: { position: 'absolute', left: space.screenH, right: space.screenH, bottom: 96 },
});
