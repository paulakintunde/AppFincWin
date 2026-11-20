/**
 * 09-16 (UI-SPEC 9c, D-03, D-18, D-45): the lock explainer. Opens once, the first time the app opens after a lock, and
 * stays reachable from the banner. It lists what stays open (every row is pressable while locked, T-09-58) and what needs
 * a plan. A member of a lapsed multi-person home also sees who paid and can take over or leave to Solo. It never implies
 * a free version exists.
 */
import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useHousehold } from '@/data/queries/household';
import { requestSignOut, performSignOut } from '@/features/auth/signOut';
import { ACTIVITY_HREF } from '@/features/auth/appHome';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { SectionHeader } from '@/ui/SectionHeader';
import { accentTintOver } from '@/ui/EmptyState';
import { Text } from '@/ui/Text';
import { IconTile } from '@/ui/icons/IconTile';
import type { IconName } from '@/ui/icons/iconData';
import { hapticTap } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { SettingsGroup } from '@/features/you/components/SettingsGroup';
import { PlanLink } from './components/NoticeCard';
import { requestPlanRefresh } from './PlanHost';
import { EXPORT_HREF, FREE_HELP_HREF, plansHref } from './routes';
import { manageSubscription } from './manageSubscription';
import { restorePurchases } from './store/purchasesClient';
import { usePlanState } from './usePlanState';

const DELETE_ACCOUNT_HREF = '/delete-account' as Href;
const LEAVE_SOLO_HREF = { pathname: '/household/leave', params: { mode: 'solo' } } as unknown as Href;

export function PlanEndedScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors, pairing } = theme;
  const { goBack } = useBackHistory();
  const plan = usePlanState();
  const multi = plan.members > 1;
  const household = useHousehold(multi ? plan.householdId : null);
  const home = household.data?.name ?? '';
  const memberOfLapsedHome = multi && !plan.payerIsMe && plan.payerName !== null;
  const noPayer = plan.payerId === null;
  const tint = accentTintOver(colors.fill1, colors.accent);
  const tile = (icon: IconName) => <IconTile icon={icon} color={colors.accent} tint={tint} />;

  const heading = multi && home !== '' ? t('lock.explainer.headingHousehold', { home }) : t('lock.explainer.heading');

  const readRecords = (): void => router.replace(ACTIVITY_HREF);
  const restore = async (): Promise<void> => {
    const result = await restorePurchases();
    if (result === 'nothing') showToast({ kind: 'info', text: { key: 'plans.paywall.states.restoreNone' } });
    else if (result !== 'restored') showToast({ kind: 'info', text: { key: 'plans.paywall.states.restoreFailed' } });
    await requestPlanRefresh({ force: true });
  };
  const signOut = async (): Promise<void> => {
    const result = await requestSignOut({ resetTheme: theme.reset });
    if (!result.needsConfirm) return;
    Alert.alert('', t('signOut.confirm.body', { count: result.count ?? 0 }), [
      { text: t('signOut.confirm.cancel'), style: 'cancel' },
      { text: t('signOut.confirm.proceed'), style: 'destructive', onPress: () => void performSignOut({ resetTheme: theme.reset }) },
    ]);
  };
  const choose = (): void => {
    hapticTap();
    router.push(plansHref({ mode: 'locked', trigger: memberOfLapsedHome ? 'notice' : 'locked' }));
  };

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="plan-ended">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {heading}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('lock.explainer.body')}</Text>
        {memberOfLapsedHome ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('lock.explainer.paidBy', { name: plan.payerName ?? '' })}
          </Text>
        ) : null}
        {noPayer ? (
          <Text testID="plan-ended-no-payer" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
            {t('lock.explainer.noPayer')}
          </Text>
        ) : null}

        <SettingsGroup title={t('lock.explainer.stillOpen')}>
          <Row label={t('lock.explainer.readRecords')} leading={tile('view')} chevron onPress={readRecords} />
          <Row label={t('plans.export.youRow')} leading={tile('download')} chevron onPress={() => router.push(EXPORT_HREF)} />
          <Row
            label={t('lock.explainer.freeHelp')}
            sublabel={t('lock.explainer.freeHelpSub')}
            leading={tile('headphones')}
            chevron
            onPress={() => router.push(FREE_HELP_HREF)}
          />
          {/* 09-25 (A5-2): never a dead tap. With no store subscription it opens the platform's subscriptions page. */}
          <Row label={t('lock.explainer.manage')} leading={tile('acctCard')} chevron onPress={() => void manageSubscription(plan.store)} />
          <Row label={t('lock.explainer.restore')} leading={tile('acctCard')} chevron onPress={() => void restore()} />
          <Row label={t('lock.explainer.signOut')} leading={tile('signOut')} chevron onPress={() => void signOut()} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lock.explainer.deleteAccount')}
            onPress={() => router.push(DELETE_ACCOUNT_HREF)}
            style={styles.deleteRow}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('lock.explainer.deleteAccount')}</Text>
          </Pressable>
        </SettingsGroup>

        {/* 09-25 (A5-1): UI-SPEC 9c makes "Needs a plan" a body list, not rows. It is plain text on the page (no card, no
            chevrons, no button role), so it does not look or announce as something to tap. "Choose a plan" below is the action. */}
        <View style={styles.needsGroup} testID="plan-ended-needs">
          <SectionHeader title={t('lock.explainer.needsPlan')} />
          <View style={styles.needs}>
            {(['edit', 'import', 'decide'] as const).map((k) => (
              <Text key={k} testID={`plan-ended-needs-${k}`} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                {t(`lock.explainer.needs.${k}`)}
              </Text>
            ))}
          </View>
        </View>

        <Pill label={memberOfLapsedHome ? t('lock.explainer.takeOver') : t('lock.explainer.choose')} variant="primary" onPress={choose} />
        {memberOfLapsedHome ? (
          <Pill label={t('lock.explainer.leaveSolo')} variant="secondary" onPress={() => router.push(LEAVE_SOLO_HREF)} />
        ) : null}
        <PlanLink label={t('lock.explainer.continueReading')} onPress={readRecords} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
  needsGroup: { marginTop: space.groupGap, gap: space.gapSm },
  needs: { gap: space.gapSm },
  deleteRow: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.cardPad },
});
