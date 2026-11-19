/**
 * 09-19 (D-19, Owner P4 2026-11-19): "Two plans cover this home". Shown only to the two payers while nobody has picked; it
 * has no dismiss control. One button per plan that fits the home ("Keep {plan}, paid by {name}"), then the 7-day default line
 * inside the body (NoticeCard has no foot slot). The pick goes to plan_double_cover_choose; a refusal or failure leaves the
 * buttons usable again with a short toast. Text is the plans.doubleCover.* rows (needs owner review per 09-WORDING.md).
 */
import React, { useCallback, useRef } from 'react';
import { useT } from '@/i18n';
import { useHouseholdMembers } from '@/data/queries/household';
import { useMemberLabel } from '@/features/household/useMemberLabel';
import { captureError } from '@/services/errors';
import { showToast } from '@/state/undoToast';
import { NoticeCard, type NoticeAction } from '../components/NoticeCard';
import { useChooseDoubleCover, type DoubleCoverState } from './doubleCover';

export interface DoubleCoverNoticeProps {
  state: DoubleCoverState | null;
  homeName?: string;
}

export function DoubleCoverNotice({ state }: DoubleCoverNoticeProps) {
  const t = useT();
  const householdId = state?.householdId ?? null;
  const { data: members } = useHouseholdMembers(householdId);
  const label = useMemberLabel(householdId);
  const choose = useChooseDoubleCover(householdId);
  // The query's pending flag arrives a tick late; a ref stops a fast second tap from sending a second pick.
  const inFlight = useRef(false);

  // The payer's own display name, even for the viewer ("paid by Bea", not "paid by You"): both buttons must read alike.
  const nameOf = useCallback(
    (userId: string) => {
      const row = members?.find((m) => m.user_id === userId);
      return row && !row.name_hidden && row.display_name ? row.display_name : label(userId);
    },
    [members, label],
  );

  if (!state || state.chosenPayer !== null) return null;

  const pick = (keepPayer: string) => {
    if (inFlight.current || choose.isPending) return;
    inFlight.current = true;
    choose.mutate(keepPayer, {
      onSettled: () => {
        inFlight.current = false;
      },
      onError: (e) => {
        captureError(e, { area: 'unknown' });
        showToast({ kind: 'refusal', text: { key: 'grow.common.notSaved' } });
      },
    });
  };

  const actions: NoticeAction[] = [];
  const sides = [
    { side: state.newSide, key: 'plans.doubleCover.choiceNew' as const, testID: 'double-cover-keep-new' },
    { side: state.oldSide, key: 'plans.doubleCover.choiceOld' as const, testID: 'double-cover-keep-old' },
  ];
  for (const { side, key, testID } of sides) {
    if (!side.fits) continue;
    actions.push({
      kind: 'primary',
      label: t(key, { plan: t(`plans.paywall.cards.${side.planKey}.name`), name: nameOf(side.payerId) }),
      onPress: () => pick(side.payerId),
      disabled: choose.isPending,
      testID,
    });
  }

  return (
    <NoticeCard
      testID="double-cover-notice"
      title={t('plans.doubleCover.title')}
      body={t('plans.doubleCover.body') + '\n\n' + t('plans.doubleCover.defaultLine')}
      actions={actions}
    />
  );
}
