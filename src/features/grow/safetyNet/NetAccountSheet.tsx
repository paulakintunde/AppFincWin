// 06-32 (D-32, CRUD #8): where the safety net is kept. The same account list the new-goal sheet's "Kept in" picker shows (live
// accounts in the net's currency, one Row each, the current one marked); Save sends only `account_id` through useEditGoal, and
// the caller shows "Now kept in {account}." with Undo. Without this the net's account could never change after the migration.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useEditGoal } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';

export interface NetAccountSheetProps {
  visible: boolean;
  net: SavingsGoalRow;
  /** Saved so far in the net's currency (useEditGoal's target guard). */
  saved: number;
  ownerId: string | null;
  householdId: string | null;
  onClose: () => void;
  onSaved: (stepId: string, accountName: string) => void;
}

export function NetAccountSheet(props: NetAccountSheetProps) {
  return props.visible ? <AccountForm {...props} /> : null;
}

function AccountForm({ net, saved, ownerId, householdId, onClose, onSaved }: NetAccountSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const accountsQ = useAccounts(householdId ?? undefined);
  const { edit } = useEditGoal();
  const accounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => a.archived_at === null && a.currency === net.currency),
    [accountsQ.data, net.currency]
  );
  const [pickedId, setPickedId] = useState<string | null>(net.account_id ?? null);
  const picked = accounts.find((a) => a.id === pickedId) ?? null;
  const changed = picked !== null && picked.id !== (net.account_id ?? null);
  const title = t('grow.goals.detail.accountSheetTitle');

  const onSave = () => {
    if (!changed || picked === null || ownerId === null) return;
    // T-06-32-03: the patch names account_id only.
    const stepId = edit(net, { account_id: picked.id }, ownerId, saved);
    onClose();
    onSaved(stepId, picked.name);
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.body}>
          <View>
            {accounts.map((a) => (
              <Row
                key={a.id}
                label={a.name}
                dense
                value={a.id === pickedId ? `${a.currency} ✓` : a.currency}
                selected={a.id === pickedId}
                accessibilityLabel={a.name}
                onPress={() => setPickedId(a.id)}
              />
            ))}
          </View>
          <Pill label={t('grow.goals.detail.accountSave')} variant="primary" disabled={!changed} onPress={onSave} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
});
