// 05-22 (DCU-07, D-11, D-12): Past decisions. Every bought, waiting and passed decision, newest first, with its state in
// words. A bought one shows its estimate against what the linked lines add up to once day 30 is reached. Numbers only.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { currencyCode } from '@/engine/money';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { shadows } from '@/theme/tokens';
import { EmptyState } from '@/ui/EmptyState';
import { Text } from '@/ui/Text';
import { METHOD_LABEL } from '../copy/codeMaps';
import { stateChip } from '../copy/verdictCopy';
import { canUse } from '../entitlements';
import { savedSoFar } from '../journal/goalProgress';
import { finalPriceOf, parseCheckInputs } from '../snapshot/checkInputs';
import { DeletableRow } from '../ui/DeletableRow';
import { GoalProgress } from '../ui/GoalProgress';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { useShouldStack } from '../ui/textFit';
import { DecisionDetailSheet } from './DecisionDetailSheet';
import { useDeleteDecision, writtenCount } from './useDeleteDecision';
import { deltaFor, localDateOf, useReopenDecision, usePastDecisions, type RowDelta } from './usePastDecisions';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

type T = (key: string, params?: Record<string, string | number>) => string;

function diffText(t: T, tone: 'over' | 'at' | 'under', diff: number, whole: (n: number) => string): string {
  if (tone === 'over') return t('decide.past.diffOver', { amount: whole(Math.abs(diff)) });
  if (tone === 'under') return t('decide.past.diffUnder', { amount: whole(Math.abs(diff)) });
  return t('decide.past.diffAt');
}

/** D-76 rule S: the estimate and the actual sit side by side, and stack when the width, text scale or value would not fit. */
function DeltaStrip({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack(value.length);
  return (
    <View style={[styles.delta, stacked ? styles.deltaStacked : null, { backgroundColor: colors.fill6 }]}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim, flexShrink: 1 }}>{label}</Text>
      <Text style={{ ...textRole(pairing, 'label'), color, flexShrink: 1, textAlign: stacked ? 'left' : 'right' }}>{value}</Text>
    </View>
  );
}

export function PastDecisionsScreen() {
  const t = useT() as T;
  const { colors, pairing } = useTheme();
  const model = usePastDecisions();
  const wholeFmt = useMoneyFormatter(false);
  const reopen = useReopenDecision(model.today);
  const del = useDeleteDecision();
  const [openId, setOpenId] = useState<string | null>(null);
  const { decisions, whole, wholeIn, formatDate, ctx } = model;

  const goalList = useMemo(() => [...model.goalByCheck.values()], [model.goalByCheck]);

  if (!canUse('decisionJournal')) return null;

  const selected = decisions.find((d) => d.id === openId) ?? null;

  const dateOf = (d: DecideCheckRow) => formatDate(d.decided_at !== null ? localDateOf(d.decided_at, ctx.timeZone) : localDateOf(d.updated_at, ctx.timeZone));

  const subLine = (d: DecideCheckRow): string | null => {
    const inputs = parseCheckInputs(d.inputs, model.today);
    const price = inputs.advertised;
    // WR-B07: the check's own figures in the currency they were typed in; a bought one shows its final price.
    const typed = wholeIn(inputs.currency);
    const date = dateOf(d);
    if (d.status === 'bought') {
      const final = finalPriceOf(inputs);
      if (final === null) return date;
      const method = inputs.method !== null ? t(METHOD_LABEL[inputs.method]) : '';
      return method === '' ? `${typed(final)} · ${date}` : t('decide.past.subBought', { price: typed(final), method, date });
    }
    if (d.status === 'waiting') {
      const goal = model.goalByCheck.get(d.id);
      const target = goal?.target ?? price;
      if (target === null) return date;
      return t('decide.past.subWaiting', {
        target: goal?.target != null ? whole(target) : typed(target),
        amount: whole(d.wait_monthly ?? 0),
        date: d.ready_by !== null ? formatDate(d.ready_by) : date,
      });
    }
    if (price === null) return date;
    const why = inputs.why.trim();
    return why === ''
      ? t('decide.past.subPassedNoWhy', { price: typed(price), date })
      : t('decide.past.subPassed', { price: typed(price), why, date });
  };

  const renderDelta = (delta: RowDelta) => {
    if (delta.kind === 'schedule') {
      return (
        <DeltaStrip
          label={t('decide.past.matched')}
          value={t('decide.past.matchedValue', { count: delta.paid, total: delta.due })}
          color={colors.ink}
        />
      );
    }
    return (
      <DeltaStrip
        label={t('decide.past.estimated', { amount: whole(delta.estimate) })}
        value={`${whole(delta.actual)} (${diffText(t, delta.tone, delta.diff, whole)})`}
        color={delta.tone === 'over' ? colors.danger : colors.accent}
      />
    );
  };

  return (
    <DetailScreen title={t('decide.past.title')}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, paddingBottom: space.gapMd }}>
        {t('decide.past.sub')}
      </Text>
      {decisions.length === 0 ? (
        <EmptyState heading={t('decide.past.emptyHeading')} body={t('decide.past.emptyBody')} />
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface }, shadows.card]}>
          {decisions.map((d, i) => {
            const chip = stateChip(d.status as 'bought' | 'waiting' | 'passed', 'full');
            const name = d.name || t('decide.quick.unnamed');
            const lines = model.linesByCheck.get(d.id) ?? [];
            const delta = deltaFor(d, lines, ctx);
            const sub = subLine(d);
            const goal = d.status === 'waiting' ? (model.goalByCheck.get(d.id) ?? null) : null;
            const progress = goal === null ? null : savedSoFar({ goal, lines: model.goalLines, home: ctx.home, rates: ctx.rates });
            const a11y = [name, t(chip.key), sub].filter((p): p is string => p !== null && p !== '').join(', ');
            const open = () => setOpenId(d.id);
            const menu = [
              { key: 'open', label: t('decide.delete.menuOpen'), onSelect: open },
              ...(d.status !== 'bought' ? [{ key: 'reopen', label: t('decide.delete.menuReopen'), onSelect: () => reopen(d) }] : []),
            ];
            return (
              <View key={d.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null}>
                <DeletableRow
                  name={name}
                  accessibilityLabel={a11y}
                  onOpen={open}
                  menu={menu}
                  confirm={del.confirmCopy(d, writtenCount(model.linksByCheck.get(d.id)))}
                  onDelete={() => del.deleteDecision(d, goalList)}
                >
                  <View style={styles.text}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                      {name}
                    </Text>
                    <View style={styles.chipRow}>
                      <StateChip tone={chip.tone as StateChipTone} label={t(chip.key)} />
                    </View>
                    {sub !== null ? (
                      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint }}>{sub}</Text>
                    ) : null}
                    {progress !== null ? (
                      <GoalProgress
                        saved={progress.saved}
                        target={progress.target}
                        whole={wholeFmt}
                        currency={currencyCode(ctx.home)}
                      />
                    ) : null}
                    {delta !== null ? renderDelta(delta) : null}
                  </View>
                </DeletableRow>
              </View>
            );
          })}
        </View>
      )}
      <DecisionDetailSheet
        decision={selected}
        links={selected !== null ? (model.linksByCheck.get(selected.id) ?? []) : []}
        linkedLines={selected !== null ? (model.linesByCheck.get(selected.id) ?? []) : []}
        onClose={() => setOpenId(null)}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radii.card, overflow: 'hidden' },
  text: { gap: 4, paddingVertical: space.rowPad, paddingLeft: 18, minHeight: space.touchMin, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapMd,
    borderRadius: radii.card,
    paddingVertical: space.gapSm,
    paddingHorizontal: space.gapMd,
  },
  deltaStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
});
