// 08-19 (HH-04, HH-05, HH-06, D-13..D-18; UI-SPEC Screen 4a): the entry sheet's Shared group and the hook that carries it.
//
// useSharedEntry holds the draft (is it shared, how split, who paid) and, once the line itself has been written, enqueues the
// sharing writes from 08-15 (share, set split, set paid by, make private). Those writes ride the same queue and the same
// version chain as the line's own edit, so they replay in order. A refused write is parked in the failed-writes list with its
// reason, never silent.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { FadeIn } from '@/ui/motion/FadeIn';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useCategoryLookup } from '@/data/queries/categories';
import { useSplitDefaults } from '@/data/queries/householdBalances';
import {
  useMakeLinePrivate,
  useSetLineSplit,
  useSetPaidBy,
  useShareLine,
} from '@/data/mutations/householdSharing';
import type { TransactionRow } from '@/db/rows';
import { showToast } from '@/state/undoToast';
import { SharedBadge } from '../components/SharedBadge';
import type { SplitRuleKey } from '../components/SplitRuleList';
import { useHouseholdScope, type HouseholdScope } from '../useHouseholdScope';
import { useMemberLabel } from '../useMemberLabel';
import { PaidByPicker } from './PaidByPicker';
import { ShareSeriesPrompt } from './ShareSeriesPrompt';
import { SplitSheet, type SplitValue } from './SplitSheet';
import { splitPreview } from './splitPreview';
import { defaultRuleFor, useLineCover, useStoredSplit, type LineCover } from './sharedLineState';
import { useSharingMoney } from './useSharingMoney';

export interface SharedDraft {
  on: boolean;
  rule: SplitRuleKey;
  /** The person changed the split by hand: only then is it sent; otherwise the server applies the household default (HH-06). */
  touched: boolean;
  /** Ticked user ids; null until known (everyone, in join order). */
  included: string[] | null;
  amounts: Record<string, number>;
  /** User id of the payer; null is the person logging the line. */
  paidBy: string | null;
  seriesScope: 'one' | 'series';
}

export interface SharedLine {
  id: string;
  /** The line's version: the edit that just went out is already in the chain, so this is the version this form started from. */
  version: number;
  /** The line's month, 'YYYY-MM'. */
  month: string;
}

export interface SharedEntry {
  /** A household of 2 or more people: the group exists at all. */
  available: boolean;
  scope: HouseholdScope;
  draft: SharedDraft;
  setDraft: React.Dispatch<React.SetStateAction<SharedDraft>>;
  /** The viewer may turn sharing on and off and change who paid (the line is new or they logged it). */
  isCreator: boolean;
  cover: LineCover;
  /** A debt or goal payment: no switch, a note instead (linked_line_personal). */
  linked: boolean;
  /** On a joint account: always shared, a note instead of a switch. */
  joint: boolean;
  /** The line as it stood before this edit; null for a new line. */
  editRow: TransactionRow | null;
  /** Everyone on the line, in join order. */
  includedIds: string[];
  /** Writes the sharing changes for a line that has just been saved. */
  commit: (line: SharedLine) => void;
}

export interface UseSharedEntryArgs {
  editRow: TransactionRow | null;
  accountShared: boolean;
  categoryId: string | null;
}

export function useSharedEntry({ editRow, accountShared, categoryId }: UseSharedEntryArgs): SharedEntry {
  const scope = useHouseholdScope();
  const { members, userId, householdId } = scope;
  const categories = useCategoryLookup(userId ?? undefined);
  const defaults = useSplitDefaults(householdId).data;
  const startRule = defaultRuleFor(defaults, categoryId !== null ? categories.byId.get(categoryId) : undefined);
  const wasShared = editRow?.is_shared === true;
  const cover = useLineCover(householdId, wasShared ? (editRow?.id ?? null) : null);
  const stored = useStoredSplit(editRow?.id ?? null, wasShared);

  const [draft, setDraft] = useState<SharedDraft>(() => ({
    on: wasShared,
    rule: (editRow?.split_rule as SplitRuleKey | null | undefined) ?? startRule,
    touched: false,
    included: null,
    amounts: {},
    paidBy: editRow?.paid_by ?? null,
    seriesScope: 'one',
  }));

  // The household default shows before anything is chosen (HH-06); once the person picks a rule it is theirs.
  const [prevStart, setPrevStart] = useState(startRule);
  if (startRule !== prevStart) {
    setPrevStart(startRule);
    if (!draft.touched && !wasShared) setDraft((d) => ({ ...d, rule: startRule }));
  }

  // A shared line being edited starts from the people and amounts stored for it.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || stored === null) return;
    seeded.current = true;
    setDraft((d) => (d.touched ? d : { ...d, included: stored.participants, amounts: stored.amounts }));
  }, [stored]);

  const share = useShareLine();
  const setSplit = useSetLineSplit();
  const setPaidBy = useSetPaidBy();
  const makePrivate = useMakeLinePrivate();

  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);
  const includedIds = draft.included ?? memberIds;
  const available = members.length >= 2;
  const isCreator = editRow === null || editRow.created_by === userId;
  const linked = Boolean(editRow && (editRow.debt_id || editRow.goal_id));
  const joint = accountShared;

  const commit = useCallback(
    (line: SharedLine) => {
      if (!available || householdId === null || userId === null) return;
      const base = { householdId, month: line.month, id: line.id, expectedVersion: line.version };
      if (joint || linked) return;

      if (!wasShared) {
        if (!draft.on) return;
        share.mutate({
          ...base,
          ...(draft.touched
            ? {
                rule: draft.rule,
                participants: includedIds,
                ...(draft.rule === 'amount' ? { amounts: draft.amounts } : {}),
              }
            : {}),
          seriesScope: draft.seriesScope,
        });
        if (draft.paidBy !== null && draft.paidBy !== userId) setPaidBy.mutate({ ...base, userId: draft.paidBy });
        return;
      }

      if (!draft.on) {
        if (!isCreator || cover !== null) return;
        const before = {
          rule: (editRow?.split_rule as SplitRuleKey | null | undefined) ?? undefined,
          participants: stored?.participants,
          amounts: stored?.amounts,
        };
        makePrivate.mutate(base);
        showToast({
          kind: 'ordinary',
          text: { key: 'household.sharing.madePrivate' },
          onUndo: () =>
            share.mutate({
              ...base,
              ...(before.rule ? { rule: before.rule } : {}),
              ...(before.participants && before.participants.length > 0 ? { participants: before.participants } : {}),
              ...(before.rule === 'amount' && before.amounts ? { amounts: before.amounts } : {}),
            }),
        });
        return;
      }

      if (draft.touched && cover === null) {
        setSplit.mutate({
          ...base,
          rule: draft.rule,
          participants: includedIds,
          ...(draft.rule === 'amount' ? { amounts: draft.amounts } : {}),
        });
      }
      const payer = editRow?.paid_by ?? editRow?.created_by ?? null;
      if (draft.paidBy !== null && draft.paidBy !== payer && cover === null) {
        setPaidBy.mutate({ ...base, userId: draft.paidBy });
      }
    },
    [available, householdId, userId, joint, linked, wasShared, draft, includedIds, share, setPaidBy, isCreator, cover, editRow, stored, makePrivate, setSplit],
  );

  return { available, scope, draft, setDraft, isCreator, cover, linked, joint, editRow, includedIds, commit };
}

export interface SharedGroupProps {
  entry: SharedEntry;
  /** The line's currency, and its size as a positive number of minor units (null until an amount is typed). */
  currency: string;
  amountMinor: number | null;
  /** Switching on for a line in a repeating series asks about every month (D-16). */
  inSeries: boolean;
}

export function SharedGroup({ entry, currency, amountMinor, inSeries }: SharedGroupProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { scope, draft, setDraft, isCreator, cover, linked, joint } = entry;
  const label = useMemberLabel(scope.householdId);
  const money = useSharingMoney(currency);
  const [splitOpen, setSplitOpen] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);

  const payerId = draft.paidBy ?? scope.userId ?? '';
  const members = scope.members;
  const total = amountMinor !== null && amountMinor > 0 ? amountMinor : null;
  const hhName = scope.name;

  const summary = useMemo(() => {
    const rule = t(`household.rules.names.${draft.rule}`);
    if (total === null) return rule;
    const p = splitPreview(
      total,
      draft.rule,
      members.map((m) => ({ userId: m.user_id, weight: m.weight })),
      entry.includedIds,
      payerId,
      draft.amounts,
    );
    if (!p.addsUp) return rule;
    const shares = p.rows.map((r) => t('household.sharing.shareLine', { name: label(r.userId), amount: money(r.amount) }));
    return t('household.sharing.splitRow', { rule, shares: shares.join(', ') });
  }, [t, draft.rule, draft.amounts, total, members, entry.includedIds, payerId, label, money]);

  if (!entry.available) return null;

  const meta = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  if (linked) {
    return (
      <Text testID="shared-linked-note" style={meta}>
        {t('household.sharing.linkedLineMeta')}
      </Text>
    );
  }

  if (joint) {
    return (
      <View style={styles.group} testID="shared-joint">
        <View style={[styles.row, { minHeight: rowHeight.one }]}>
          <SharedBadge />
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1 }}>{t('household.sharing.jointNote')}</Text>
        </View>
        <Text style={meta}>{t('household.sharing.jointPaid')}</Text>
      </View>
    );
  }

  const switchDisabled = cover !== null;
  const onToggle = (on: boolean) => {
    setDraft((d) => ({ ...d, on }));
    if (on && inSeries) setSeriesOpen(true);
  };

  return (
    <View style={styles.group} testID="shared-group">
      {isCreator ? (
        <>
          <ToggleRow
            label={t('household.sharing.shared')}
            sub={t('household.sharing.sharedHelper', { household: hhName })}
            value={draft.on}
            onChange={onToggle}
            disabled={switchDisabled}
            accessibilityHint={switchDisabled ? t('household.sharing.coveredBySettle') : undefined}
          />
          {switchDisabled ? <Text style={meta}>{t('household.sharing.coveredBySettle')}</Text> : null}
        </>
      ) : null}
      {draft.on ? (
        <FadeIn>
          {isCreator ? (
            <PaidByPicker
              householdId={scope.householdId}
              members={members}
              viewerId={scope.userId}
              value={draft.paidBy}
              onChange={(id) => setDraft((d) => ({ ...d, paidBy: id === scope.userId ? null : id }))}
              disabled={cover !== null}
            />
          ) : null}
          <Pressable
            testID="split-row"
            accessibilityRole="button"
            accessibilityLabel={t('household.sharing.splitRowA11y', { summary })}
            accessibilityState={{ disabled: cover !== null }}
            disabled={cover !== null}
            onPress={() => setSplitOpen(true)}
            style={[styles.row, { minHeight: rowHeight.one }]}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.sharing.splitRowLabel')}</Text>
            <Text numberOfLines={2} style={{ ...textRole(pairing, 'body'), color: colors.inkMuted, flex: 1, textAlign: 'right' }}>
              {summary}
            </Text>
          </Pressable>
        </FadeIn>
      ) : null}
      <SplitSheet
        visible={splitOpen}
        householdId={scope.householdId}
        currency={currency}
        total={total}
        householdCurrency={scope.household?.reporting_currency ?? null}
        payerId={payerId}
        value={{ rule: draft.rule, included: entry.includedIds, amounts: draft.amounts }}
        onClose={() => setSplitOpen(false)}
        onSave={(next: SplitValue) => {
          setDraft((d) => ({ ...d, rule: next.rule, included: next.included, amounts: next.amounts, touched: true }));
          setSplitOpen(false);
        }}
      />
      <ShareSeriesPrompt
        visible={seriesOpen}
        onAll={() => {
          setDraft((d) => ({ ...d, seriesScope: 'series' }));
          setSeriesOpen(false);
        }}
        onOne={() => {
          setDraft((d) => ({ ...d, seriesScope: 'one' }));
          setSeriesOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: step.tight },
  row: { flexDirection: 'row', alignItems: 'center', gap: step.row },
});
