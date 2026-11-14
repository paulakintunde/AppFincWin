/**
 * 06.1-43 (G-1, audit C-4; D-54): which account holds this envelope? The one fix for an envelope readiness item: an envelope is
 * never waived, it is linked. Lists the household's live money accounts; tapping one saves only `account_id` on the goal through
 * Grow's own writer, shows the usual undo toast and closes. With no accounts it shows one line and no list.
 * 06.1-44: the writer comes in as a prop from the shell (as NetSetup's does); the decide feature may not import Grow's goal writes,
 * which reach the exchange-rate fetch door (depcruise fx-fetch-never-from-reads).
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { DECIDE_READ_STALE_MS } from '@/data/queries/decideStale';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import type { SavingsGoalRow } from '@/db/savingsGoals';
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
  /** Grow's goal writer, bound by the shell: saves only account_id and returns the undo step id. */
  setAccount: SetEnvelopeAccount;
}

/** Saves `accountId` as the goal's account (patch `{ account_id }` only) and returns the undo step id. */
export type SetEnvelopeAccount = (goal: SavingsGoalRow, accountId: string, ownerId: string) => string;

const ROW_HEIGHT = 52;

export function EnvelopeAccountSheet(props: EnvelopeAccountSheetProps) {
  return props.visible ? <EnvelopeAccountForm {...props} /> : null;
}

function EnvelopeAccountForm({ goalId, onClose, setAccount }: EnvelopeAccountSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const goalsQ = useSavingsGoalRows(userId, householdId, { staleTime: DECIDE_READ_STALE_MS }); // 06.1-78 (G-72-2)
  const accountsQ = useAccounts(householdId);

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
    const stepId = setAccount(goal, accountId, userId);
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
                {/* 06.1-61 (D-76 rule T): a long account name wraps; the row grows from its minimum height. */}
                <Text style={labelStyle}>{a.name}</Text>
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
