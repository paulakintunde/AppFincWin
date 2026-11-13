/**
 * 06.1-43 (G-1, audit C-4; D-54): which account holds this envelope? The one fix for an envelope readiness item: an envelope is
 * never waived, it is linked. Lists the household's live money accounts; tapping one saves only `account_id` on the goal through
 * Grow's own writer (useEditGoal), shows the usual undo toast and closes. With no accounts it shows one line and no list.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useEditGoal } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { holdsMoney } from '@/features/record/accounts/accountUseSuggest';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';

export interface EnvelopeAccountSheetProps {
  /** The envelope's id, which is its savings goal's id. */
  goalId: string;
  visible: boolean;
  onClose: () => void;
}

const ROW_HEIGHT = 52;

export function EnvelopeAccountSheet(props: EnvelopeAccountSheetProps) {
  return props.visible ? <EnvelopeAccountForm {...props} /> : null;
}

function EnvelopeAccountForm({ goalId, onClose }: EnvelopeAccountSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const goalsQ = useSavingsGoalRows(userId, householdId);
  const accountsQ = useAccounts(householdId);
  const { edit } = useEditGoal();

  const goal = goalsQ.data?.find((g) => g.id === goalId && g.deleted_at === null) ?? null;
  const accounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => a.archived_at === null && a.deleted_at === null && holdsMoney(a.kind)),
    [accountsQ.data]
  );
  const title = t('decide.screens.sheetsHome.envelopeAccount.title', { envelope: goal?.name ?? '' });

  const pick = (accountId: string, accountName: string): void => {
    if (goal === null || userId === undefined) return;
    hapticLight();
    // D-54: the patch names account_id only.
    const stepId = edit(goal, { account_id: accountId }, userId, 0);
    showToast({ kind: 'ordinary', text: { key: 'grow.goals.detail.accountSavedToast', params: { account: accountName } }, stepId });
    onClose();
  };

  const labelStyle = { ...textRole(pairing, 'body'), color: colors.ink };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.body}>
        {accounts.length === 0 ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('decide.screens.sheetsHome.envelopeAccount.none')}</Text>
        ) : (
          <View>
            {accounts.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={a.name}
                accessibilityState={{ selected: goal?.account_id === a.id }}
                onPress={() => pick(a.id, a.name)}
                style={({ pressed }) => [styles.row, { borderBottomColor: colors.line2 }, pressed && styles.pressed]}
              >
                <Text style={labelStyle} numberOfLines={1}>
                  {a.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  row: { minHeight: ROW_HEIGHT, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: PRESSED_OPACITY },
});
