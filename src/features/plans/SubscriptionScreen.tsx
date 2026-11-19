// 09-15 (UI-SPEC section 6): You > Subscription. Manage subscription is the first row for the payer and opens the store's page;
// the app never claims to cancel (D-23). A member of a covered home sees who pays (D-14); testers and the owner see Free access.
// Every word is a plans.* key; every price is a store string.
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useHouseholdScope } from '@/features/household/useHouseholdScope';
import { captureError } from '@/services/errors';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { accentTintOver } from '@/ui/EmptyState';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { IconTile } from '@/ui/icons/IconTile';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { ToastView } from '@/ui/ToastView';
import { tOneOf } from '@/i18n';
import { PlanStatusCard } from './components/PlanStatusCard';
import { PlanLink } from './components/NoticeCard';
import { DisclosureBlock } from './components/DisclosureBlock';
import { plansHref, PLANS_HREF } from './routes';
import { loadOffers, openManageSubscription } from './store/purchasesClient';
import { subscriptionModel } from './subscriptionModel';
import { usePlanState } from './usePlanState';
import { usePurchaseFlow, type RestoreToastKey } from './usePurchaseFlow';
import type { PlanOffer } from './types';

const TOAST_MS = 4000;
const LEAVE_SOLO_HREF = { pathname: '/household/leave', params: { mode: 'solo' } } as unknown as Href;

/** 09-18 replaces the body: the notice cards that belong on Subscription (UI-SPEC section 7). */
export function SubscriptionNoticeSlot() {
  return null;
}

export function SubscriptionScreen() {
  const { t, i18n } = useTranslation();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  const plan = usePlanState();
  const flow = usePurchaseFlow();
  const scope = useHouseholdScope();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const [offers, setOffers] = useState<PlanOffer[] | null>(null);
  const [now] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const [toast, setToast] = useState<RestoreToastKey | null>(null);

  // The held product's price is asked of the store each time the screen opens and is never remembered.
  useEffect(() => {
    let live = true;
    loadOffers({ platform, trialAvailable: false })
      .then((list) => {
        if (live) setOffers(list);
      })
      .catch((e: unknown) => {
        captureError(e, { area: 'unknown' });
      });
    return () => {
      live = false;
    };
  }, [platform]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const offerPrice = offers?.find((o) => o.productId === plan.productId)?.priceString ?? null;
  const planName = plan.planKey ? t(`plans.paywall.cards.${plan.planKey}.name`) : '';
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const model = useMemo(
    () => subscriptionModel(plan, { platform, offerPrice, homeName: scope.name || null, planName, tz, locale: i18n.language, now }),
    [plan, platform, offerPrice, scope.name, planName, tz, i18n.language, now],
  );

  const tint = accentTintOver(colors.fill1, colors.accent);
  const acctTile = <IconTile icon="acctCard" color={colors.accent} tint={tint} />;
  const body = { ...textRole(pairing, 'body'), color: colors.inkDim };
  const home = scope.name;
  const note = model.noteKey ? tOneOf(t, model.noteKey as never, model.noteParams) : null;

  const onRestore = async () => {
    const key = await flow.restore();
    if (key) setToast(key);
  };

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('plans.subscription.title')}
      </Text>
      <View style={styles.stack}>
        {model.showManage ? (
          <Row
            label={t('plans.subscription.manage')}
            sublabel={t('plans.subscription.manageSub', model.manageSubParams)}
            leading={acctTile}
            chevron
            emphasis
            onPress={() => {
              void openManageSubscription();
            }}
          />
        ) : null}
        {model.showEndsLine ? <Text style={body}>{t('plans.subscription.endsLine')}</Text> : null}

        {model.planStatusCard ? (
          <PlanStatusCard
            title={model.variant === 'tester' || model.variant === 'owner' ? '' : planName}
            badge={model.badge}
            rows={model.rows}
            note={note}
            onSeeMembers={() => pushOnce('/household' as Href)}
          />
        ) : null}

        {model.variant === 'member' ? (
          <View testID="subscription-member-card" style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('plans.member.title')}
            </Text>
            <Text style={body}>{t('plans.member.body', model.memberBodyParams)}</Text>
          </View>
        ) : null}

        {model.showEntry ? (
          <View testID="subscription-entry-card" style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('plans.subscription.empty.title')}
            </Text>
            <Text style={body}>{t('plans.subscription.empty.body')}</Text>
            <Pill variant="primary" label={t('plans.paywall.cta.startTrial')} onPress={() => pushOnce(plansHref({ mode: 'first_run', trigger: 'change_plan' }))} />
          </View>
        ) : null}

        <SubscriptionNoticeSlot />

        {model.showChangePlan ? (
          <Row
            label={t('plans.subscription.changePlan')}
            leading={acctTile}
            chevron
            onPress={() => pushOnce(model.variant === 'locked' ? plansHref({ mode: 'locked', trigger: 'change_plan' }) : PLANS_HREF)}
          />
        ) : null}
        {model.showRestore ? (
          <Row
            label={t('plans.subscription.restore')}
            leading={acctTile}
            chevron
            onPress={() => {
              void onRestore();
            }}
          />
        ) : null}
        {model.variant === 'member' ? <PlanLink label={t('plans.member.startOwn')} onPress={() => setLeaving(true)} /> : null}

        <DisclosureBlock lines={[{ key: 'plans.paywall.pledge' }]} />
      </View>

      <ConfirmSheet
        visible={leaving}
        title={t('plans.member.startOwnTitle')}
        body={t('plans.member.startOwnBody', { home })}
        cancelLabel={t('plans.member.startOwnStay', { home })}
        confirmLabel={t('plans.member.startOwnContinue')}
        onConfirm={() => {
          setLeaving(false);
          pushOnce(LEAVE_SOLO_HREF);
        }}
        onCancel={() => setLeaving(false)}
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
  back: { marginBottom: space.gapMd },
  stack: { marginTop: space.groupGap, gap: space.groupGap },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  toast: { position: 'absolute', left: space.screenH, right: space.screenH, bottom: 96 },
});
