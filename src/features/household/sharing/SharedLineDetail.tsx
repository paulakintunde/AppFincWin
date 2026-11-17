// 08-19 (HH-04, D-14, D-15, D-18; UI-SPEC 4d): what the line detail adds for a shared line. Who is on it, who logged it, who
// paid, the split (editable by any member while no settle-up covers the line), the viewer's own category, the change history,
// and the stale-write card. Amount, date and note stay read-only unless the viewer logged the line or paid for it.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useCategoryLookup } from '@/data/queries/categories';
import { useHouseholdEvents } from '@/data/queries/household';
import { useSetLineSplit, useSetMyLineCategory, splitUndoVars } from '@/data/mutations/householdSharing';
import { fetchMyLineCategories } from '@/db/transactionSplits';
import type { TransactionRow } from '@/db/rows';
import { categoryName } from '@/features/record/categoryName';
import { CategoryPicker } from '@/features/record/entry/pickers/CategoryPicker';
import { monthOf } from '@/engine/time';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { MemberAvatar } from '../components/MemberAvatar';
import { SharedBadge } from '../components/SharedBadge';
import { ChangeLine } from '../components/ChangeLine';
import type { SplitRuleKey } from '../components/SplitRuleList';
import { useNoticeFormat } from '../noticeText';
import { useHouseholdScope } from '../useHouseholdScope';
import { useMemberLabel } from '../useMemberLabel';
import { SplitSheet, type SplitValue } from './SplitSheet';
import { splitPreview } from './splitPreview';
import { StaleWriteCard } from './StaleWriteCard';
import { useLineCover, useStoredSplit, type LineCover } from './sharedLineState';
import { useSharingMoney } from './useSharingMoney';

/** What the viewer may do with a shared line (D-14, D-15): the UI hides the rest; the server refuses it anyway. */
export interface SharedLineRights {
  isCreator: boolean;
  isPayer: boolean;
  /** Amount, date and note: the creator or the payer, and only while no settle-up covers the line. */
  canEditFields: boolean;
  canDelete: boolean;
  cover: LineCover;
}

export function sharedLineRights(
  row: Pick<TransactionRow, 'created_by' | 'paid_by'>,
  viewerId: string | null,
  cover: LineCover,
): SharedLineRights {
  const isCreator = viewerId !== null && row.created_by === viewerId;
  const payer = row.paid_by ?? row.created_by;
  const isPayer = viewerId !== null && payer === viewerId;
  return { isCreator, isPayer, canEditFields: (isCreator || isPayer) && cover === null, canDelete: isCreator && cover === null, cover };
}

/**
 * Shows its children only when the viewer may take this action on the line. A line that is not shared renders them as they
 * are, with no household reads at all, so every personal line behaves exactly as before.
 */
export function SharedActionGate({ row, action, children }: { row: TransactionRow; action: 'edit' | 'delete'; children: React.ReactNode }) {
  if (row.is_shared !== true) return <>{children}</>;
  return (
    <GateInner row={row} action={action}>
      {children}
    </GateInner>
  );
}

function GateInner({ row, action, children }: { row: TransactionRow; action: 'edit' | 'delete'; children: React.ReactNode }) {
  const scope = useHouseholdScope();
  const cover = useLineCover(scope.householdId, row.id);
  const rights = sharedLineRights(row, scope.userId, cover);
  const allowed = action === 'edit' ? rights.canEditFields : rights.canDelete;
  return allowed ? <>{children}</> : null;
}

export interface SharedLineDetailProps {
  row: TransactionRow;
  /** "Make my change again" on the stale-write card: the host reopens the edit with the fresh line. */
  onMakeChangeAgain: () => void;
}

export function SharedLineDetail({ row, onMakeChangeAgain }: SharedLineDetailProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const scope = useHouseholdScope();
  const { householdId, userId, members } = scope;
  const label = useMemberLabel(householdId);
  const money = useSharingMoney(row.original_currency);
  const stored = useStoredSplit(row.id, true);
  const rights = sharedLineRights(row, userId, useLineCover(householdId, row.id));
  const categories = useCategoryLookup(userId ?? undefined);
  const setSplit = useSetLineSplit();
  const setMyCategory = useSetMyLineCategory();
  const events = useHouseholdEvents(householdId, userId ?? undefined).events;
  const noticeFormat = useNoticeFormat(householdId, scope.name);
  const [splitOpen, setSplitOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [myCategory, setMyCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let live = true;
    void fetchMyLineCategories(supabase, userId, [row.id])
      .then((rows) => {
        if (live) setMyCategoryId(rows[0]?.category_id ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId, row.id]);

  const month = monthOf(row.local_date);
  const payerId = row.paid_by ?? row.created_by;
  const rule = (row.split_rule as SplitRuleKey | null) ?? 'even';
  const participants = stored?.participants ?? members.map((m) => m.user_id);
  const total = Math.abs(row.original_amount);

  const summary = useMemo(() => {
    const ruleName = t(`household.rules.names.${rule}`);
    if (stored === null) return ruleName;
    const p = splitPreview(
      total,
      rule,
      members.map((m) => ({ userId: m.user_id, weight: m.weight })),
      participants,
      payerId ?? '',
      stored.amounts,
    );
    if (!p.addsUp) return ruleName;
    return t('household.sharing.splitRow', {
      rule: ruleName,
      shares: p.rows.map((r) => t('household.sharing.shareLine', { name: label(r.userId), amount: money(r.amount) })).join(', '),
    });
  }, [t, rule, stored, total, members, participants, payerId, label, money]);

  const saveSplit = (next: SplitValue) => {
    setSplitOpen(false);
    if (householdId === null) return;
    const vars = {
      householdId,
      month,
      id: row.id,
      expectedVersion: row.version,
      rule: next.rule,
      participants: next.included,
      ...(next.rule === 'amount' ? { amounts: next.amounts } : {}),
    };
    setSplit.mutate(vars, {
      onSuccess: (res) => {
        const undo = splitUndoVars(vars, res);
        showToast({ kind: 'ordinary', text: { key: 'household.sharing.splitSaved' }, onUndo: undo ? () => setSplit.mutate(undo) : null });
      },
    });
  };

  const lineEvents = events.filter((e) => e.ref_id === row.id && (e.kind === 'split_changed' || e.kind === 'made_private'));
  const latestSplitEventId = lineEvents.find((e) => e.kind === 'split_changed')?.id ?? null;

  const undoFor = (e: (typeof lineEvents)[number]): (() => void) | undefined => {
    if (e.kind !== 'split_changed' || e.id !== latestSplitEventId || rights.cover !== null || householdId === null) return undefined;
    const before = e.params.before as { rule?: SplitRuleKey; participants?: string[]; shares?: Record<string, number> } | undefined;
    if (!before?.rule || !before.participants || before.participants.length === 0) return undefined;
    return () =>
      setSplit.mutate({
        householdId,
        month,
        id: row.id,
        expectedVersion: row.version,
        rule: before.rule as SplitRuleKey,
        participants: before.participants as string[],
        ...(before.rule === 'amount' && before.shares ? { amounts: before.shares } : {}),
      });
  };

  const ownCategory = myCategory !== null ? categories.byId.get(myCategory) : undefined;
  const meta = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const rowStyle = [styles.row, { minHeight: rowHeight.one }];

  return (
    <View style={styles.column} testID="shared-line-detail">
      {householdId !== null ? (
        <StaleWriteCard householdId={householdId} lineId={row.id} month={month} onMakeAgain={onMakeChangeAgain} />
      ) : null}

      <View style={styles.row}>
        <View style={styles.avatars}>
          {participants.map((id) => (
            <MemberAvatar key={id} householdId={householdId} userId={id} size={28} />
          ))}
        </View>
        <SharedBadge />
        {rights.cover !== null ? (
          <StatusBadge
            status={rights.cover === 'settled' ? 'paid' : 'pending'}
            label={t(rights.cover === 'settled' ? 'household.sharing.settledBadge' : 'household.sharing.waitingBadge')}
            testID="shared-cover-badge"
          />
        ) : null}
      </View>
      <Text style={meta}>{t('household.sharing.loggedBy', { name: label(row.created_by) })}</Text>
      <Text style={meta}>{t('household.sharing.paidByMeta', { name: label(payerId ?? null) })}</Text>
      {!rights.isCreator && !rights.isPayer ? (
        <Text testID="shared-creator-only" style={meta}>
          {t('household.sharing.creatorOnly', { name: label(row.created_by) })}
        </Text>
      ) : null}
      {rights.cover !== null ? <Text style={meta}>{t('household.sharing.settledNoEdit')}</Text> : null}

      <Pressable
        testID="detail-split-row"
        accessibilityRole="button"
        accessibilityLabel={t('household.sharing.splitRowA11y', { summary })}
        accessibilityState={{ disabled: rights.cover !== null }}
        disabled={rights.cover !== null}
        onPress={() => setSplitOpen(true)}
        style={rowStyle}
      >
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.sharing.splitRowLabel')}</Text>
        <Text numberOfLines={2} style={{ ...textRole(pairing, 'body'), color: colors.inkMuted, flex: 1, textAlign: 'right' }}>
          {summary}
        </Text>
      </Pressable>

      <Pressable
        testID="detail-own-category"
        accessibilityRole="button"
        accessibilityLabel={`${t('household.sharing.yourCategory')}, ${ownCategory ? categoryName(ownCategory, t) : ''}`}
        onPress={() => setCategoryOpen(true)}
        style={rowStyle}
      >
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.sharing.yourCategory')}</Text>
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.inkMuted, flex: 1, textAlign: 'right' }}>
          {ownCategory ? categoryName(ownCategory, t) : ''}
        </Text>
      </Pressable>

      {lineEvents.length > 0 ? (
        <View testID="shared-changes">
          <Text accessibilityRole="header" style={meta}>
            {t('household.sharing.changes')}
          </Text>
          {lineEvents.map((e) => (
            <ChangeLine
              key={e.id}
              householdId={householdId}
              actorId={e.actor_id}
              text={noticeFormat.text(e)}
              at={noticeFormat.when(e.created_at)}
              onUndo={undoFor(e)}
            />
          ))}
        </View>
      ) : null}

      <SplitSheet
        visible={splitOpen}
        householdId={householdId}
        currency={row.original_currency}
        total={total}
        householdCurrency={scope.household?.reporting_currency ?? null}
        payerId={payerId ?? ''}
        value={{ rule, included: participants, amounts: stored?.amounts ?? {} }}
        onClose={() => setSplitOpen(false)}
        onSave={saveSplit}
      />
      <CategoryPicker
        visible={categoryOpen}
        categories={categories.active}
        selectedId={myCategory}
        onSelect={(id) => {
          setCategoryOpen(false);
          setMyCategoryId(id);
          if (householdId !== null && userId !== null) {
            setMyCategory.mutate({ householdId, month, userId, transactionId: row.id, categoryId: id });
          }
        }}
        onClose={() => setCategoryOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  row: { flexDirection: 'row', alignItems: 'center', gap: step.row },
  avatars: { flexDirection: 'row', gap: step.hair },
});
