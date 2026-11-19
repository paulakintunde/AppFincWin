// 08-22 (D-40, HH-14, UI-SPEC Screen 11): Delete my account. Plain words about what is erased, an extra paragraph for people in a
// shared household (shared lines stay as "Former member", the owner hand-off), a typed confirmation, then the server deletion.
// Never blocked by household state (D-27). The device is wiped only after the server confirms (see requestAccountDeletion).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Screen } from '@/ui/Screen';
import { Pill } from '@/ui/Pill';
import { TextInput } from '@/ui/TextInput';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { requestAccountDeletion } from '@/services/account/deleteAccount';
import { useHouseholdScope } from '@/features/household/useHouseholdScope';
import { useMemberLabel } from '@/features/household/useMemberLabel';
import { WarningCard } from '@/ui/WarningCard';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { usePlanState } from '@/features/plans/usePlanState';
import { manageSubscription } from '@/features/plans/manageSubscription';
import { useAccountDeletionPreview } from './useAccountDeletionPreview';

export function DeleteAccountScreen() {
  const t = useT();
  const { colors, pairing, reset: resetTheme } = useTheme();
  const { goBack } = useBackHistory();
  const scope = useHouseholdScope();
  const label = useMemberLabel(scope.householdId);
  const preview = useAccountDeletionPreview(scope.userId);
  const plan = usePlanState();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const word = t('household.account.confirmWord');
  const matches = typed.trim().toUpperCase() === word.toUpperCase();
  const info = preview.data;
  const shared = info?.in_shared_household === true;
  const ownerName = shared && info?.is_owner && info.next_owner_user_id ? label(info.next_owner_user_id) : null;
  // D-23: deleting the account does not cancel a store subscription. Shown to the payer of an active store plan; never blocks.
  const billing =
    plan.payerIsMe && (plan.store === 'APP_STORE' || plan.store === 'PLAY_STORE') && (plan.status === 'trial' || plan.status === 'active' || plan.status === 'grace');
  const othersCovered = billing ? Math.max(0, plan.members - 1) : 0;
  const ready = matches && scope.online && !busy && !preview.isLoading;

  async function onDelete() {
    if (!ready) return;
    setBusy(true);
    setFailed(false);
    const result = await requestAccountDeletion({ resetTheme });
    // On success the session is gone and the signed-out gate replaces this screen; on failure nothing changed.
    if (!result.ok) {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.account.title')}
      </Text>

      {billing ? (
        <View testID="delete-billing-warning" style={styles.billing}>
          <WarningCard
            tone="soft"
            title={t('plans.deleteWarning.title')}
            value=""
            body={[t('plans.deleteWarning.body'), ...(othersCovered > 0 ? [t('plans.deleteWarning.payerCovers', { count: othersCovered })] : [])]}
          />
          <PlanLink
            label={t('plans.deleteWarning.manage')}
            onPress={() => {
              void manageSubscription(plan.store);
            }}
          />
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.account.intro')}</Text>
        {shared ? (
          <Text testID="delete-household-paragraph" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('household.account.householdParagraph', { household: info?.household_name?.trim() ? info.household_name : t('household.home.unnamed') })}
          </Text>
        ) : null}
        {ownerName ? (
          <Text testID="delete-owner-line" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('household.account.ownerLine', { name: ownerName })}
          </Text>
        ) : null}
      </View>

      <View style={styles.confirm}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.account.confirmLabel', { word })}</Text>
        <TextInput
          testID="delete-confirm-input"
          value={typed}
          onChangeText={setTyped}
          editable={!busy}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={t('household.account.confirmLabel', { word })}
          style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.fill1 }]}
        />
      </View>

      <View style={styles.action}>
        <Pill
          label={t('household.account.finalButton')}
          variant="danger"
          disabled={!ready}
          pending={busy}
          onPress={() => {
            void onDelete();
          }}
        />
        {busy ? (
          <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {t('household.account.progress')}
          </Text>
        ) : null}
        {!scope.online ? (
          <Text testID="delete-offline" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {t('household.account.offline')}
          </Text>
        ) : null}
        {failed ? (
          <Text testID="delete-failed" accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {t('household.account.failure')}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  billing: { marginTop: step.section, gap: step.tight, alignItems: 'flex-start' },
  card: { marginTop: step.section, padding: step.card, borderRadius: radii.card, gap: step.tight },
  confirm: { marginTop: step.section, gap: step.tight },
  input: { minHeight: space.touchMin, paddingHorizontal: step.card, borderRadius: radii.card },
  action: { marginTop: step.section, gap: step.tight, alignItems: 'flex-start' },
});
