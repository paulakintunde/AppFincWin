/**
 * 09-16 (UI-SPEC 9a and the grace row of section 7): one line at the top of every tab. Locked: a Read-only badge, the
 * sentence and a "Choose a plan" link; not dismissible. Household variant names the home and who paid. Grace: payment
 * overdue with full access until a date, linking to the plan details. Nothing renders in any other state.
 * The lock lifts only when the server says writable (9e): there is no animation on removal.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useHousehold } from '@/data/queries/household';
import { useT } from '@/i18n';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { PlanLink } from './components/NoticeCard';
import { formatPlanDate } from './formatPlanDate';
import { PLAN_ENDED_HREF, SUBSCRIPTION_HREF, plansHref } from './routes';
import { usePlanState } from './usePlanState';

export function LockBanner() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const plan = usePlanState();
  const household = useHousehold(plan.members > 1 ? plan.householdId : null);

  const locked = plan.status === 'locked';
  const grace = plan.status === 'grace' && !plan.leftGrace;
  if (plan.loading || (!locked && !grace)) return null;

  const body = textRole(pairing, 'label');
  let text: string;
  let linkLabel: string;
  let onLink: () => void;
  if (locked) {
    const multi = plan.members > 1;
    const home = household.data?.name ?? '';
    text = multi && home !== '' ? t('lock.bannerHousehold', { home }) : t('lock.banner');
    if (multi && plan.payerName) text = `${text} ${t('lock.bannerPaidBy', { name: plan.payerName })}`;
    linkLabel = t('lock.bannerLink');
    onLink = () => router.push(plansHref({ mode: 'locked', trigger: 'locked' }));
  } else {
    text = t('plans.notices.grace.banner', { date: formatPlanDate(plan.graceUntil) });
    linkLabel = t('plans.notices.grace.action');
    onLink = () => router.push(SUBSCRIPTION_HREF);
  }

  return (
    <View testID={locked ? 'lock-banner' : 'grace-banner'} style={[styles.bar, { backgroundColor: colors.fill1, paddingTop: insets.top + space.gapSm }]}>
      {locked ? <StatusBadge status="readOnly" /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text}
        disabled={!locked}
        onPress={() => router.push(PLAN_ENDED_HREF)}
      >
        <Text style={{ ...body, color: colors.ink }}>{text}</Text>
      </Pressable>
      <PlanLink label={linkLabel} onPress={onLink} testID="lock-banner-link" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.screenH, paddingBottom: space.gapSm, gap: 4 },
});
