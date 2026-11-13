// 06.1-27 (UX-20, D47 / N20): "Your decisions". Every decided check, newest first, and a look-back card for the newest bought one whose
// records can be compared: "Did it cost what you expected?" The look-back compares records, it is not a score; after 3 of them one plain
// line says how close the estimates were. Data hooks are the existing ones; nothing here computes a verdict.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useAttachLine, useUnlinkLine } from '@/data/mutations/decideLinks';
import { useAttachCandidates } from '@/data/queries/decide';
import { homeAmountFor } from '@/data/queries/homeAmount';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { TransactionRow } from '@/db/rows';
import { useT } from '@/i18n';
import { canUse } from '@/features/decide/entitlements';
import { finalPriceOf, parseCheckInputs } from '@/features/decide/snapshot/checkInputs';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { deltaFor, localDateOf, usePastDecisions } from './data/usePastDecisions';
import { goDecideHome } from '../logic/decideNav';
import { DETAIL_HREF } from './detailHref';
import { LookBackCard } from './LookBackCard';
import { howClosePercent, lookBackOf, type LookBack } from './lookBack';

type T = (key: string, params?: Record<string, string | number>) => string;


/** A saved-to-the-record badge in plain words. It carries no state colour: the look-back is not a verdict. */
function SavedBadge({ label }: { label: string }) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.fill6 }]}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{label}</Text>
    </View>
  );
}

export function PastDecisionsScreen() {
  const t = useT() as T;
  const { colors, pairing } = useTheme();
  const model = usePastDecisions();
  const { decisions, ctx, whole, wholeIn, formatDate } = model;
  const { attach } = useAttachLine();
  const { unlink } = useUnlinkLine();
  // "No" hides the card for this visit only; nothing is written, so a later visit asks again.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const linksRef = useRef(model.linksByCheck);
  // Undo runs after the new link has synced into the cache, so it reads the latest links, not the ones at press time.
  useEffect(() => {
    linksRef.current = model.linksByCheck;
  }, [model.linksByCheck]);

  const lookBacks = useMemo(() => {
    const out = new Map<string, LookBack>();
    for (const d of decisions) {
      const lb = lookBackOf(deltaFor(d, model.linesByCheck.get(d.id) ?? [], ctx));
      if (lb !== null) out.set(d.id, lb);
    }
    return out;
  }, [decisions, model.linesByCheck, ctx]);

  const due = decisions.find((d) => lookBacks.has(d.id) && !skipped.has(d.id)) ?? null;
  const dueDate = due?.decided_at != null ? localDateOf(due.decided_at, ctx.timeZone) : ctx.today;
  const candidates = useAttachCandidates(model.householdId, dueDate, dueDate, due !== null).data;

  // The same-day line not yet linked to this decision: money out, in the home currency, never a transfer leg.
  const extra = useMemo<{ line: TransactionRow; amount: number } | null>(() => {
    if (due === null) return null;
    const taken = new Set((model.linksByCheck.get(due.id) ?? []).map((l: DecideLinkRow) => l.target_id));
    for (const l of candidates ?? []) {
      if (l.deleted_at !== null || l.transfer_id !== null || taken.has(l.id)) continue;
      if (l.recurring_series_id !== null && taken.has(l.recurring_series_id)) continue;
      const amount = homeAmountFor(l, ctx.home, ctx.rates);
      if (amount !== null && amount < 0) return { line: l, amount: Math.abs(amount) };
    }
    return null;
  }, [due, candidates, model.linksByCheck, ctx.home, ctx.rates]);

  if (!canUse('decisionJournal')) return null;

  const nameOf = (d: DecideCheckRow) => d.name || t('decide.quick.unnamed');
  const dateOf = (d: DecideCheckRow) => formatDate(localDateOf(d.decided_at ?? d.updated_at, ctx.timeZone));

  const outcomeOf = (d: DecideCheckRow): string => {
    if (d.status === 'bought') return t('decide.screens.past.list.bought', { date: dateOf(d) });
    if (d.status === 'waiting') return `${t('decide.screens.past.list.notBought')} · ${t('decide.screens.past.list.savedAsPlan')}`;
    return t('decide.screens.past.list.notBuying');
  };

  const amountOf = (d: DecideCheckRow): string | null => {
    const inputs = parseCheckInputs(d.inputs, model.today);
    const value = d.status === 'bought' ? (finalPriceOf(inputs) ?? inputs.advertised) : inputs.advertised;
    return value === null ? null : wholeIn(inputs.currency)(value);
  };

  const onYes = (d: DecideCheckRow) => {
    if (extra === null || model.userId === null || model.householdId === null || d.decided_at === null) return;
    const linkId = attach({
      userId: model.userId,
      checkId: d.id,
      householdId: model.householdId,
      entity: 'transactions',
      targetId: extra.line.id,
      decidedAt: d.decided_at,
      lineDate: extra.line.local_date,
      timeZone: ctx.timeZone,
    });
    showToast({
      kind: 'ordinary',
      text: { key: 'decide.screens.past.list.savedToast' },
      onUndo: () => {
        const link = linksRef.current.get(d.id)?.find((l) => l.id === linkId);
        if (link !== undefined) unlink(link, extra.line.name ?? extra.line.note ?? '');
      },
    });
  };

  const onNo = (d: DecideCheckRow) => {
    if (extra === null) return;
    setSkipped((prev) => new Set(prev).add(d.id));
    showToast({
      kind: 'ordinary',
      text: { key: 'decide.screens.past.list.leftOutToast', params: { amount: whole(extra.amount) } },
      onUndo: () =>
        setSkipped((prev) => {
          const next = new Set(prev);
          next.delete(d.id);
          return next;
        }),
    });
  };

  const how = howClosePercent([...lookBacks.values()]);
  const dueLb = due !== null ? lookBacks.get(due.id) : undefined;

  return (
    <DetailScreen title={t('decide.screens.past.list.title')}>
      <View style={styles.stack}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.past.list.sub')}</Text>
        {due !== null && dueLb !== undefined ? (
          <LookBackCard
            item={nameOf(due)}
            boughtOn={dateOf(due)}
            expected={whole(dueLb.expected)}
            actual={whole(dueLb.actual)}
            difference={
              dueLb.diff > 0
                ? t('decide.screens.past.list.more', { amount: whole(dueLb.diff) })
                : dueLb.diff < 0
                  ? t('decide.screens.past.list.less', { amount: whole(-dueLb.diff) })
                  : t('decide.screens.past.list.same')
            }
            differenceTone={dueLb.diff > 0 ? 'danger' : dueLb.diff < 0 ? 'accent' : 'ink'}
            extra={extra !== null ? whole(extra.amount) : null}
            onYes={() => onYes(due)}
            onNo={() => onNo(due)}
          />
        ) : null}
        {decisions.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState heading={t('decide.screens.past.list.emptyTitle')} body={t('decide.screens.past.list.emptyBody')} />
            <Pill variant="secondary" label={t('decide.screens.common.backToDecide')} onPress={() => goDecideHome(router)} />
          </View>
        ) : (
          <View style={[styles.list, { backgroundColor: colors.surface }]}>
            {decisions.map((d, i) => {
              const amount = amountOf(d);
              const outcome = outcomeOf(d);
              return (
                <Pressable
                  key={d.id}
                  testID={`past-row-${d.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={[nameOf(d), outcome, d.status === 'bought' ? null : dateOf(d), amount]
                    .filter((p): p is string => p !== null && p !== '')
                    .join(', ')}
                  onPress={() => pushOnce(DETAIL_HREF(d.id))}
                  style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null]}
                >
                  <View style={styles.text}>
                    <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{nameOf(d)}</Text>
                    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint }}>
                      {d.status === 'bought' ? outcome : `${outcome} · ${dateOf(d)}`}
                    </Text>
                    <View style={styles.badgeRow}>
                      <SavedBadge label={t('decide.screens.past.list.saved')} />
                    </View>
                  </View>
                  {amount !== null ? <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{amount}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        )}
        {how !== null ? (
          <Text testID="past-how-close" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
            {t('decide.screens.past.list.howClose', { count: how.count, percent: how.percent })}
          </Text>
        ) : null}
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
  empty: { gap: space.gapMd, alignItems: 'center' },
  list: { borderRadius: radii.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingHorizontal: space.cardPad, minHeight: space.touchMin },
  text: { flex: 1, gap: 4, paddingVertical: space.rowPad },
  badgeRow: { flexDirection: 'row' },
  badge: { borderRadius: radii.card, paddingVertical: 2, paddingHorizontal: space.gapSm },
});
