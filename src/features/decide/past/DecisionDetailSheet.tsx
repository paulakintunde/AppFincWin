// 05-22 (DCU-07, D-10, D-11, D-12): one decision in detail. A bought decision is compared with the lines linked to it at
// 30 and 90 days, numbers only. Lines can be attached and unlinked; the decision can be removed (the check row only,
// never the lines it wrote) or, for a waiting or passed one, reopened as a new check.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRemoveDecision } from '@/data/mutations/decideChecks';
import { useUnlinkLine } from '@/data/mutations/decideLinks';
import { newStepId } from '@/data/mutations/undoCapture';
import { useGoalLines, useSavingsGoals } from '@/data/queries/decide';
import { homeAmountFor } from '@/data/queries/homeAmount';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { TransactionRow } from '@/db/rows';
import { currencyCode } from '@/engine/money';
import { monthOf } from '@/engine/time';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { DetailRow, DetailSheet } from '@/ui/DetailSheet';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { METHOD_LABEL } from '../copy/codeMaps';
import { stateChip } from '../copy/verdictCopy';
import { canUse } from '../entitlements';
import { compareEstimate, type Checkpoint } from '../journal/estimateActual';
import { savedSoFar } from '../journal/goalProgress';
import { cancelCheckReminders } from '../notifications/waitReminder';
import { parseCheckInputs } from '../snapshot/checkInputs';
import { GoalProgress } from '../ui/GoalProgress';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { AttachLineSheet } from './AttachLineSheet';
import { useGoalTagEdit } from './goalTagEdit';
import { estimateInputFor, localDateOf, usePastContext, useReopenDecision } from './usePastDecisions';

export interface DecisionDetailSheetProps {
  decision: DecideCheckRow | null;
  links: readonly DecideLinkRow[];
  linkedLines: readonly TransactionRow[];
  onClose: () => void;
}

type Tone = 'over' | 'at' | 'under';
const DASH = '—';

interface LinkView {
  link: DecideLinkRow;
  name: string;
  date: string | null;
  amount: number | null;
}

export function DecisionDetailSheet({ decision, links, linkedLines, onClose }: DecisionDetailSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { userId, householdId, today, ctx, whole, formatDate } = usePastContext();
  const wholeFmt = useMoneyFormatter(false);
  const goals = useSavingsGoals(userId ?? undefined, householdId ?? undefined).data;
  const { remove } = useRemoveDecision();
  const { unlink } = useUnlinkLine();
  const edit = useGoalTagEdit();
  const reopen = useReopenDecision(today);
  const [confirming, setConfirming] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [tagging, setTagging] = useState(false);
  const goal = decision !== null && decision.status === 'waiting' ? ((goals ?? []).find((g) => g.check_id === decision.id && g.deleted_at === null) ?? null) : null;
  const goalLines = useGoalLines(householdId, goal === null ? [] : [goal.id]).data;

  if (!canUse('decisionJournal')) return null;

  const visible = decision !== null;
  const status = decision?.status ?? 'bought';
  const chip = stateChip(status === 'open' ? 'draft' : status, 'full');
  const inputs = decision !== null ? parseCheckInputs(decision.inputs, today) : null;
  const decidedDate = decision?.decided_at != null ? localDateOf(decision.decided_at) : null;
  const price = inputs?.advertised ?? null;
  const money = (n: number | null) => (n === null ? DASH : whole(n));

  const toneOf = (tone: Tone): 'danger' | 'accent' => (tone === 'over' ? 'danger' : 'accent');
  const diffText = (tone: Tone, diff: number) =>
    tone === 'over'
      ? t('decide.past.diffOver', { amount: whole(Math.abs(diff)) })
      : tone === 'under'
        ? t('decide.past.diffUnder', { amount: whole(Math.abs(diff)) })
        : t('decide.past.diffAt');

  // Estimate against actual, from the linked lines (D-12).
  const input = decision !== null && status === 'bought' ? estimateInputFor(decision, linkedLines, ctx) : null;
  const compared = input !== null ? compareEstimate(input, today) : null;
  const reached: Checkpoint[] = compared !== null ? compared.checkpoints.filter((c) => c.reached) : [];
  const latest = reached.length > 0 ? reached[reached.length - 1]! : null;
  const pending = compared !== null ? compared.checkpoints.find((c) => !c.reached) ?? null : null;

  // One row per link: a line link shows its line, a series link shows the series by its first line with the lines' total.
  const linkViews: LinkView[] = links.map((link) => {
    const mine =
      link.entity === 'transactions'
        ? linkedLines.filter((l) => l.id === link.target_id)
        : linkedLines.filter((l) => l.recurring_series_id === link.target_id);
    const sorted = [...mine].sort((a, b) => (a.local_date < b.local_date ? -1 : 1));
    let amount: number | null = null;
    for (const l of sorted) {
      const a = homeAmountFor(l, ctx.home, ctx.rates);
      if (a === null) {
        amount = null;
        break;
      }
      amount = (amount ?? 0) + Math.abs(a);
    }
    return { link, name: sorted[0]?.name ?? sorted[0]?.note ?? '', date: sorted[0]?.local_date ?? null, amount };
  });

  const onUnlink = (v: LinkView) => {
    const stepId = unlink(v.link, v.name);
    showToast({ kind: 'destructive', text: { key: 'decide.toast.unlinked' }, stepId });
  };

  // D-34: tagging a transfer to the goal is an ordinary undoable edit of goal_id; the server refuses a goal that is not the user's own.
  const setGoalTag = (row: TransactionRow, goalId: string | null) => {
    if (userId === null) return;
    const stepId = newStepId();
    const recorded = edit(
      { id: row.id, householdId: row.household_id, month: monthOf(row.local_date), expectedVersion: row.version, patch: { goal_id: goalId } },
      {
        stepId,
        ownerId: userId,
        labelKey: goalId === null ? 'transferUntagged' : 'transferTagged',
        labelParams: { name: row.name ?? row.note ?? '' },
        before: { goal_id: goalId === null ? (goal?.id ?? null) : null },
      }
    );
    showToast({
      kind: 'ordinary',
      text: { key: goalId === null ? 'decide.depth.goal.untagged' : 'decide.depth.goal.tagged' },
      ...(recorded ? { stepId } : {}),
    });
  };

  const tagged = goal === null ? [] : (goalLines ?? []).filter((l) => l.goal_id === goal.id && l.deleted_at === null);

  const onRemove = () => {
    if (decision === null) return;
    const goalOf = (goals ?? []).find((g) => g.check_id === decision.id && g.deleted_at === null) ?? null;
    const stepId = remove(decision, goalOf);
    cancelCheckReminders(decision.id).catch(() => {});
    setConfirming(false);
    onClose();
    showToast({ kind: 'destructive', text: { key: 'decide.toast.removed' }, stepId });
  };

  const onReopen = () => {
    if (decision === null) return;
    reopen(decision);
    onClose();
  };

  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };
  const excludeIds = links.map((l) => l.target_id);

  return (
    <>
      <DetailSheet
        visible={visible && !confirming}
        onDismiss={onClose}
        accessibilityLabel={decision?.name ?? t('decide.past.title')}
        title={decision?.name || t('decide.quick.unnamed')}
        trailing={<StateChip tone={chip.tone as StateChipTone} label={t(chip.key)} />}
        note={
          latest !== null && latest.toneMonthly === 'over' ? (
            <Text style={{ ...meta, color: colors.inkDim, paddingBottom: space.gapSm }}>
              {t('decide.past.runningOver', { amount: whole(Math.abs(latest.diffMonthly)) })}
            </Text>
          ) : null
        }
        actions={
          <>
            {decision !== null && decision.status !== 'bought' ? (
              <Pill label={t('decide.past.reopenCheck')} variant="primary" onPress={onReopen} />
            ) : null}
            <Pill label={t('decide.past.remove')} variant="danger" onPress={() => setConfirming(true)} />
            <Pill label={t('decide.past.close')} variant="secondary" onPress={onClose} />
          </>
        }
      >
        {decision !== null && status === 'bought' ? (
          <>
            <DetailRow label={t('decide.past.finalPrice')} value={price !== null ? whole(price) : null} emptyText={DASH} />
            <DetailRow
              label={t('decide.past.paidHow')}
              value={inputs?.method != null ? t(METHOD_LABEL[inputs.method]) : null}
              emptyText={DASH}
            />
            <DetailRow
              label={t('decide.past.estDay')}
              value={input !== null ? whole(input.estimateDayOne) : null}
              emptyText={DASH}
            />
            <DetailRow
              label={t('decide.past.actDay')}
              value={latest !== null ? whole(latest.dayOneActual) : null}
              emptyText={DASH}
            />
            <DetailRow
              label={t('decide.past.estMonth')}
              value={input !== null ? whole(input.estimateMonthly) : null}
              emptyText={DASH}
            />
            <DetailRow
              label={t('decide.past.actMonth')}
              value={latest !== null ? whole(latest.monthlyActual) : null}
              emptyText={DASH}
            />
            <DetailRow label={t('decide.past.reviewed')} value={t('decide.past.reviewedValue')} emptyText={DASH} />
            {pending !== null ? (
              <Text style={{ ...meta, color: colors.inkDim, paddingVertical: space.gapSm }}>
                {t('decide.past.pendingAt', { days: pending.days, date: formatDate(pending.date) })}
              </Text>
            ) : null}
            {input !== null
              ? reached.map((c) => (
                  <View key={c.days} style={styles.compare}>
                    <Text style={{ ...meta, color: colors[toneOf(c.toneDayOne)] }}>
                      {t('decide.past.compare', {
                        label: t('decide.past.dayOneLabel'),
                        days: c.days,
                        actual: money(c.dayOneActual),
                        estimate: money(input.estimateDayOne),
                        diff: diffText(c.toneDayOne, c.diffDayOne),
                      })}
                    </Text>
                    <Text style={{ ...meta, color: colors[toneOf(c.toneMonthly)] }}>
                      {t('decide.past.compare', {
                        label: t('decide.past.monthlyLabel'),
                        days: c.days,
                        actual: money(c.monthlyActual),
                        estimate: money(input.estimateMonthly),
                        diff: diffText(c.toneMonthly, c.diffMonthly),
                      })}
                    </Text>
                  </View>
                ))
              : null}
          </>
        ) : decision !== null ? (
          <>
            <DetailRow label={t('decide.past.quoted')} value={price !== null ? whole(price) : null} emptyText={DASH} />
            {status === 'passed' ? (
              <DetailRow
                label={t('decide.past.whyPassed')}
                value={inputs !== null && inputs.why.trim() !== '' ? inputs.why.trim() : null}
                emptyText={DASH}
              />
            ) : null}
            {goal !== null ? (
              <View style={styles.goal}>
                <GoalProgress
                  saved={savedSoFar({ goal, lines: goalLines ?? [], home: ctx.home, rates: ctx.rates }).saved}
                  target={goal.target}
                  whole={wholeFmt}
                  currency={currencyCode(ctx.home)}
                />
                {tagged.map((l) => {
                  const amount = homeAmountFor(l, ctx.home, ctx.rates);
                  const name = l.name ?? l.note ?? '';
                  return (
                    <View key={l.id} style={styles.lineRow}>
                      <View style={styles.lineText}>
                        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
                        <Text style={{ ...meta, color: colors.inkFaint }}>{formatDate(l.local_date)}</Text>
                      </View>
                      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
                        {amount !== null ? whole(Math.abs(amount)) : t('decide.depth.goal.waitingRate')}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('decide.depth.goal.untagA11y')}
                        onPress={() => setGoalTag(l, null)}
                        style={styles.unlink}
                      >
                        <CloseGlyph color={colors.inkDim} />
                      </Pressable>
                    </View>
                  );
                })}
                <Pill label={t('decide.depth.goal.tag')} variant="secondary" onPress={() => setTagging(true)} />
              </View>
            ) : null}
            {decidedDate !== null ? (
              <Text style={{ ...meta, color: colors.inkDim, paddingTop: space.gapSm }}>
                {t('decide.past.decided', { date: formatDate(decidedDate) })}
              </Text>
            ) : null}
            {status === 'passed' ? (
              <Text style={{ ...meta, color: colors.inkDim }}>{t('decide.past.keptUntil')}</Text>
            ) : null}
          </>
        ) : null}

        {decision !== null && status === 'bought' ? (
          <View style={styles.linked}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
              {t('decide.past.linked', { count: linkViews.length })}
            </Text>
            {linkViews.map((v) => (
              <View key={v.link.id} style={styles.lineRow}>
                <View style={styles.lineText}>
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{v.name}</Text>
                  {v.date !== null ? <Text style={{ ...meta, color: colors.inkFaint }}>{formatDate(v.date)}</Text> : null}
                </View>
                {v.amount !== null ? (
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{whole(v.amount)}</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('decide.past.unlinkA11y', { name: v.name })}
                  onPress={() => onUnlink(v)}
                  style={styles.unlink}
                >
                  <CloseGlyph color={colors.inkDim} />
                </Pressable>
              </View>
            ))}
            <Pill label={t('decide.past.attach')} variant="secondary" onPress={() => setAttaching(true)} />
          </View>
        ) : null}
      </DetailSheet>

      <ConfirmSheet
        visible={confirming}
        title={t('decide.past.removeTitle')}
        body={t('decide.past.removeBody')}
        cancelLabel={t('decide.past.removeKeep')}
        confirmLabel={t('decide.past.removeConfirm')}
        destructive
        onConfirm={onRemove}
        onCancel={() => setConfirming(false)}
      />

      {goal !== null && householdId !== null ? (
        <AttachLineSheet
          mode="transfer"
          visible={tagging}
          householdId={householdId}
          excludeIds={tagged.map((l) => l.id)}
          onPick={(row) => setGoalTag(row, goal.id)}
          onClose={() => setTagging(false)}
        />
      ) : null}

      {decision !== null && userId !== null && householdId !== null ? (
        <AttachLineSheet
          visible={attaching}
          householdId={householdId}
          checkId={decision.id}
          userId={userId}
          decidedAt={decision.decided_at ?? decision.updated_at}
          excludeIds={excludeIds}
          onClose={() => setAttaching(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  compare: { gap: 2, paddingVertical: space.gapSm },
  goal: { paddingVertical: space.gapSm },
  linked: { gap: space.gapSm, paddingTop: space.cardPad },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin },
  lineText: { flex: 1 },
  unlink: {
    width: space.touchMin,
    height: space.touchMin,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
