// 08.1-23 (CMP-F19, UX-21): the joint account's purpose as a row. In the account sheet it replaces the personal "What this account is
// for" row for a joint account, since the group's purpose decides how it counts; Shared accounts reads the same words. Tapping opens
// the purpose sheet for any member (22 Q2).
import React, { useState } from 'react';
import { useJointAccountFacts } from '@/data/queries/jointAccounts';
import type { JointPurposeRow as PurposeRow } from '@/db/jointAccounts';
import { useT } from '@/i18n';
import { Row } from '@/ui/Row';
import { JointPurposeSheet } from './JointPurposeSheet';
import { useToday } from './useSpendRule';

/** The purpose word for a list value, or "Purpose not set". */
export function usePurposeWord(): (row: Pick<PurposeRow, 'joint_purpose'> | null | undefined) => string {
  const t = useT();
  return (row) => (row?.joint_purpose == null ? t('household.rules.shared.purposeNotSet') : t(`household.rules.jointPurpose.${row.joint_purpose}.label`));
}

export function JointPurposeRow({ householdId, account }: { householdId: string | null | undefined; account: { id: string; name: string } }) {
  const t = useT();
  const today = useToday();
  const word = usePurposeWord();
  const purposes = useJointAccountFacts(householdId, today).data?.purposes;
  const current = purposes?.find((p) => p.id === account.id) ?? null;
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row
        label={t('household.rules.jointPurpose.rowLabel')}
        sublabel={word(current)}
        sublabelTone={current?.joint_purpose == null ? 'warn1' : 'inkMuted'}
        chevron
        dense
        onPress={() => setOpen(true)}
      />
      <JointPurposeSheet visible={open} householdId={householdId} account={account} current={current} onClose={() => setOpen(false)} />
    </>
  );
}
