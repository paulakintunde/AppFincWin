// 08.1-23 (CMP-F19, UX-21, owner 2026-11-21 Q8-Q10): what a joint account is for. Opens after an account is saved with Joint turned
// on (nothing picked: closing leaves it unset, which counts as everyday, 22 Q7) and from Shared accounts (the current purpose picked).
// Any member may change it (22 Q2); the server names the change in Notices and the toast offers Undo. Joint savings shows "Can be
// spent" (22 Q6) and "This is our safety net" (Q10); turning the safety net on turns "Can be spent" off. The RPC validates
// everything; refusals are shown in plain words and never retried (T-08.1-67).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { ToggleRow } from '@/ui/ToggleRow';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { mutationKeys, queryKeys } from '@/data/keys';
import { useSetJointAccountPurpose } from '@/data/queries/jointAccounts';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import type { JointPurposeRow, JointPurposeValue } from '@/db/jointAccounts';
import { showToast } from '@/state/undoToast';
import { ChoiceList, type Choice } from '../components/ChoiceList';
import { ExplainTip } from '../components/ExplainTip';

export const PURPOSES: readonly JointPurposeValue[] = ['bills', 'savings', 'everyday'];

export interface JointPurposeSheetProps {
  visible: boolean;
  householdId: string | null | undefined;
  account: { id: string; name: string };
  /** the purpose as last read; null or absent = not set (a new joint account) */
  current?: Pick<JointPurposeRow, 'joint_purpose' | 'joint_savings_spendable' | 'joint_safety_net' | 'version'> | null;
  onClose: () => void;
}

export function JointPurposeSheet(props: JointPurposeSheetProps) {
  if (!props.visible) return null;
  return <JointPurposeBody {...props} />;
}

type Failure = 'notJoint' | 'notMember' | 'conflict' | 'failed';

function JointPurposeBody({ householdId, account, current, onClose }: JointPurposeSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { isOnline } = useSyncStatus();
  const setPurpose = useSetJointAccountPurpose(householdId);
  // a new joint account is still on its way to the server: the purpose waits for it (the RPC would not find it yet)
  const accountWrites = useIsMutating({ mutationKey: mutationKeys.addAccount }) + useIsMutating({ mutationKey: mutationKeys.editAccount });
  const [purpose, setPurposeValue] = useState<JointPurposeValue | null>(current?.joint_purpose ?? null);
  const [spendable, setSpendable] = useState(current?.joint_savings_spendable === true);
  const [safetyNet, setSafetyNet] = useState(current?.joint_safety_net === true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const title = t('household.rules.jointPurpose.title', { account: account.name });

  const before = { purpose: current?.joint_purpose ?? null, spendable: current?.joint_savings_spendable === true, safetyNet: current?.joint_safety_net === true };
  const savings = purpose === 'savings';
  const changed = purpose !== null && (purpose !== before.purpose || (savings && (spendable !== before.spendable || safetyNet !== before.safetyNet)));
  const waiting = accountWrites > 0;
  const canSave = changed && isOnline && !waiting;

  const choices: Choice<JointPurposeValue>[] = PURPOSES.map((p) => ({
    key: p,
    label: t(`household.rules.jointPurpose.${p}.label`),
    helper: t(`household.rules.jointPurpose.${p}.helper`),
    tip: t(`household.rules.jointPurpose.${p}.tip`),
  }));

  const save = async () => {
    if (!canSave || saving || purpose === null) return;
    setSaving(true);
    setFailure(null);
    try {
      const res = await setPurpose.mutateAsync({
        accountId: account.id,
        purpose,
        spendable: savings && spendable && !safetyNet,
        safetyNet: savings && safetyNet,
        expectedVersion: current?.version ?? null,
      });
      if (!res.ok) {
        hapticFailed();
        if (res.reason === 'version_conflict') {
          setFailure('conflict');
          if (householdId) await qc.invalidateQueries({ queryKey: queryKeys.jointAccountFactsRoot(householdId) });
        } else setFailure(res.reason === 'not_joint' ? 'notJoint' : res.reason === 'not_member' ? 'notMember' : 'failed');
        return;
      }
      hapticTap();
      const version = res.version;
      showToast({
        kind: 'ordinary',
        text: { key: 'household.rules.jointPurpose.saved' },
        onUndo: () => {
          void setPurpose
            .mutateAsync({ accountId: account.id, purpose: before.purpose, spendable: before.spendable, safetyNet: before.safetyNet, expectedVersion: typeof version === 'number' ? version : null })
            .catch(() => undefined);
        },
      });
      onClose();
    } catch {
      hapticFailed();
      setFailure('failed');
    } finally {
      setSaving(false);
    }
  };

  const failureText =
    failure === 'notJoint'
      ? t('household.rules.jointPurpose.notJoint')
      : failure === 'notMember'
        ? t('household.rules.jointPurpose.notMember')
        : failure === 'conflict'
          ? t('household.rules.jointPurpose.conflict')
          : failure === 'failed'
            ? t('household.rules.failed')
            : null;
  const muted = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={muted}>{t('household.rules.jointPurpose.intro')}</Text>
        <ChoiceList
          value={purpose}
          choices={choices}
          onChange={(p) => {
            setFailure(null);
            setPurposeValue(p);
          }}
          accessibilityLabel={title}
          testIDPrefix="joint-purpose"
        />
        {savings ? (
          <View style={styles.switches} testID="joint-savings-switches">
            <ToggleRow
              label={t('household.rules.jointPurpose.safetyNet')}
              value={safetyNet}
              onChange={(next) => {
                setSafetyNet(next);
                if (next) setSpendable(false);
              }}
            />
            <ExplainTip name={t('household.rules.jointPurpose.safetyNet')} text={t('household.rules.jointPurpose.safetyNetTip')} testID="joint-safety-net-tip" />
            <ToggleRow
              label={t('household.rules.jointPurpose.spendable')}
              value={spendable && !safetyNet}
              disabled={safetyNet}
              onChange={(next) => setSpendable(next)}
            />
            <ExplainTip name={t('household.rules.jointPurpose.spendable')} text={t('household.rules.jointPurpose.spendableTip')} testID="joint-spendable-tip" />
          </View>
        ) : null}
        {failureText !== null ? (
          <Text accessibilityRole="alert" testID="joint-purpose-failure" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {failureText}
          </Text>
        ) : null}
        {!isOnline ? <Text style={muted}>{t('household.home.offline.helper')}</Text> : null}
        {waiting && isOnline ? <Text style={muted}>{t('household.rules.jointPurpose.waiting')}</Text> : null}
        <Pill label={t('household.rules.jointPurpose.save')} variant="primary" onPress={() => void save()} disabled={!canSave} pending={saving} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  switches: { gap: step.hair },
});
